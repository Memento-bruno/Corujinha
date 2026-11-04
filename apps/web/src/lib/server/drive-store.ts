import "server-only";
import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";
import { ConflictError, KeyedMutex, type BlobStore, type StoredBlob } from "./blob-store";
import { env } from "./env";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

function driveClient(): drive_v3.Drive {
  if (env.driveAuthMode === "service_account") {
    const auth = new google.auth.JWT({
      email: env.serviceAccountEmail,
      key: env.serviceAccountPrivateKey,
      scopes: SCOPES,
    });
    return google.drive({ version: "v3", auth });
  }
  const auth = new google.auth.OAuth2(env.googleClientId, env.googleClientSecret);
  auth.setCredentials({ refresh_token: env.driveRefreshToken });
  return google.drive({ version: "v3", auth });
}

/**
 * Banco de dados no Google Drive: uma única pasta compartilhada pelo casal
 * (GOOGLE_DRIVE_FOLDER_ID). NÃO usa appDataFolder, para que os dois vejam os mesmos dados.
 *
 * ETag = campo `version` do arquivo no Drive (aumenta a cada alteração). Antes de gravar
 * conferimos a versão atual; se mudou desde a leitura, a gravação é recusada (ConflictError)
 * e a interface pede para recarregar. A janela entre conferir e gravar é coberta por um
 * mutex no servidor; como o app roda num único servidor para o casal, isso basta.
 */
export class DriveBlobStore implements BlobStore {
  readonly kind = "drive" as const;
  private drive = driveClient();
  private ids = new Map<string, string>();
  private mutex = new KeyedMutex();

  constructor(private readonly folderId: string) {}

  private async meta(name: string): Promise<{ id: string; version: string } | null> {
    const cachedId = this.ids.get(name);
    if (cachedId) {
      try {
        const r = await this.drive.files.get({ fileId: cachedId, fields: "id,version,trashed", supportsAllDrives: true });
        if (r.data.id && !r.data.trashed) return { id: r.data.id, version: String(r.data.version) };
      } catch {
        /* cai para a busca por nome */
      }
      this.ids.delete(name);
    }
    const q = `name = '${name.replace(/'/g, "\\'")}' and '${this.folderId}' in parents and trashed = false`;
    const r = await this.drive.files.list({
      q,
      fields: "files(id,version)",
      pageSize: 2,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const f = r.data.files?.[0];
    if (!f?.id) return null;
    this.ids.set(name, f.id);
    return { id: f.id, version: String(f.version) };
  }

  async read(name: string): Promise<StoredBlob | null> {
    const m = await this.meta(name);
    if (!m) return null;
    const r = await this.drive.files.get(
      { fileId: m.id, alt: "media", supportsAllDrives: true },
      { responseType: "text" },
    );
    return { content: String(r.data), etag: m.version };
  }

  async write(name: string, content: string, expectedEtag: string | null): Promise<{ etag: string }> {
    return this.mutex.run(name, async () => {
      const m = await this.meta(name);
      const currentEtag = m?.version ?? null;
      if (currentEtag !== expectedEtag) throw new ConflictError(name, currentEtag);
      const media = { mimeType: "application/json", body: Readable.from([content]) };
      if (m) {
        const r = await this.drive.files.update({
          fileId: m.id,
          media,
          fields: "id,version",
          supportsAllDrives: true,
        });
        return { etag: String(r.data.version) };
      }
      const r = await this.drive.files.create({
        requestBody: { name, parents: [this.folderId], mimeType: "application/json" },
        media,
        fields: "id,version",
        supportsAllDrives: true,
      });
      if (r.data.id) this.ids.set(name, r.data.id);
      return { etag: String(r.data.version) };
    });
  }

  async list(prefix: string): Promise<string[]> {
    const names: string[] = [];
    let pageToken: string | undefined;
    do {
      const r = await this.drive.files.list({
        q: `'${this.folderId}' in parents and trashed = false and name contains '${prefix}'`,
        fields: "nextPageToken, files(id,name)",
        pageSize: 200,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of r.data.files ?? []) {
        if (f.name?.startsWith(prefix)) {
          names.push(f.name);
          if (f.id) this.ids.set(f.name, f.id);
        }
      }
      pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);
    return names.sort();
  }

  async remove(name: string): Promise<void> {
    const m = await this.meta(name);
    if (m) await this.drive.files.update({ fileId: m.id, requestBody: { trashed: true }, supportsAllDrives: true });
    this.ids.delete(name);
  }
}

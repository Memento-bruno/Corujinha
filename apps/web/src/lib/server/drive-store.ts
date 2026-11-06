import "server-only";
import { createHash } from "node:crypto";
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

interface DriveFileVersion {
  version?: string | null;
  md5Checksum?: string | null;
}

/**
 * ETag de um arquivo do Drive: o MD5 do conteúdo. O campo `version` do Drive também pode subir
 * por mudanças que não são do conteúdo (metadados), e aí o app achava que outro aparelho tinha
 * mexido no arquivo sem ninguém ter mexido. Como cada gravação é
 * criptografada com IV aleatório, todo conteúdo novo tem MD5 diferente.
 */
function etagOf(f: DriveFileVersion, content?: string): string {
  if (f.md5Checksum) return f.md5Checksum;
  if (content !== undefined) return createHash("md5").update(content, "utf8").digest("hex");
  return `v${f.version}`;
}

/** Quanto tempo a listagem da pasta pode ser reaproveitada para ler arquivos sem perguntar de novo ao Drive. */
const LISTING_TTL_MS = 5000;
const MD5 = /^[0-9a-f]{32}$/;

interface FileRef {
  id: string;
  etag: string;
}

/**
 * Banco de dados no Google Drive: uma única pasta compartilhada pelo casal
 * (GOOGLE_DRIVE_FOLDER_ID). NÃO usa appDataFolder, para que os dois vejam os mesmos dados.
 *
 * ETag = MD5 do conteúdo do arquivo no Drive (muda a cada gravação). Antes de gravar
 * conferimos a versão atual; se mudou desde a leitura, a gravação é recusada (ConflictError)
 * e o app junta a edição com a versão nova.
 *
 * Na Vercel o app roda em VÁRIOS servidores ao mesmo tempo, e o Drive não tem "grave só se
 * a versão for X". Por isso, além do mutex (que só vale dentro de um servidor):
 * - depois de atualizar, conferimos no histórico de versões do arquivo se a versão anterior à
 *   nossa era mesmo a que lemos. Se outra gravação entrou no meio, devolvemos o conteúdo dela
 *   e respondemos conflito, para nenhuma das duas se perder;
 * - depois de criar, conferimos se outro servidor criou o mesmo arquivo ao mesmo tempo. Fica
 *   sempre o mais antigo; o nosso vai para a lixeira e respondemos conflito.
 */
export class DriveBlobStore implements BlobStore {
  readonly kind = "drive" as const;
  private drive: drive_v3.Drive;
  private ids = new Map<string, string>();
  private mutex = new KeyedMutex();
  /** Última listagem da pasta (nome → id e ETag), para não perguntar arquivo por arquivo. */
  private listing: { at: number; files: Map<string, FileRef> } | null = null;

  /** `drive` só é passado nos testes (um Drive de mentira). */
  constructor(
    private readonly folderId: string,
    drive?: drive_v3.Drive,
  ) {
    this.drive = drive ?? driveClient();
  }

  private freshListing(): Map<string, FileRef> | null {
    return this.listing && Date.now() - this.listing.at < LISTING_TTL_MS ? this.listing.files : null;
  }

  /** Arquivos com esse nome na pasta, do mais antigo para o mais novo. */
  private async findByName(name: string): Promise<drive_v3.Schema$File[]> {
    const q = `name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and '${this.folderId}' in parents and trashed = false`;
    const r = await this.drive.files.list({
      q,
      fields: "files(id,version,md5Checksum,createdTime)",
      orderBy: "createdTime",
      pageSize: 10,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const files = (r.data.files ?? []).filter((f) => f.id);
    if (files.length > 1) console.warn(`[corujinha] ${files.length} arquivos ${name} na pasta; usando o mais antigo.`);
    return files;
  }

  /** `fresh` ignora a listagem guardada (obrigatório antes de gravar). */
  private async meta(name: string, fresh = false): Promise<FileRef | null> {
    const listed = fresh ? null : this.freshListing();
    if (listed) return listed.get(name) ?? null;
    const cachedId = this.ids.get(name);
    if (cachedId) {
      try {
        const r = await this.drive.files.get({ fileId: cachedId, fields: "id,version,md5Checksum,trashed", supportsAllDrives: true });
        if (r.data.id && !r.data.trashed) return { id: r.data.id, etag: etagOf(r.data) };
      } catch {
        /* cai para a busca por nome */
      }
      this.ids.delete(name);
    }
    const f = (await this.findByName(name))[0];
    if (!f?.id) return null;
    this.ids.set(name, f.id);
    return { id: f.id, etag: etagOf(f) };
  }

  async read(name: string): Promise<StoredBlob | null> {
    const m = await this.meta(name);
    if (!m) return null;
    const r = await this.drive.files.get(
      { fileId: m.id, alt: "media", supportsAllDrives: true },
      { responseType: "text" },
    );
    const content = String(r.data);
    // A listagem pode ter alguns segundos: se o conteúdo baixado não é o listado, o ETag certo é o do conteúdo.
    const etag = MD5.test(m.etag) ? createHash("md5").update(content, "utf8").digest("hex") : m.etag;
    return { content, etag };
  }

  async write(name: string, content: string, expectedEtag: string | null): Promise<{ etag: string }> {
    return this.mutex.run(name, async () => {
      this.listing = null;
      const m = await this.meta(name, true);
      const currentEtag = m?.etag ?? null;
      if (currentEtag !== expectedEtag) throw new ConflictError(name, currentEtag);
      const media = { mimeType: "application/json", body: Readable.from([content]) };
      if (m) {
        const r = await this.drive.files.update({
          fileId: m.id,
          media,
          fields: "id,version,md5Checksum",
          supportsAllDrives: true,
        });
        const etag = etagOf(r.data, content);
        await this.assertNotOverwritten(name, m.id, expectedEtag, etag);
        return { etag };
      }
      const r = await this.drive.files.create({
        requestBody: { name, parents: [this.folderId], mimeType: "application/json" },
        media,
        fields: "id,version,md5Checksum",
        supportsAllDrives: true,
      });
      const etag = etagOf(r.data, content);
      if (r.data.id) {
        this.ids.set(name, r.data.id);
        await this.assertNotDuplicated(name, r.data.id);
      }
      return { etag };
    });
  }

  /**
   * Outro servidor gravou o mesmo arquivo entre a nossa conferência e a nossa gravação?
   * O histórico de versões diz: a versão logo antes da nossa precisa ser a que lemos.
   */
  private async assertNotOverwritten(name: string, fileId: string, expectedEtag: string | null, ourEtag: string) {
    if (!expectedEtag || !MD5.test(expectedEtag) || !MD5.test(ourEtag)) return;
    let revisions: drive_v3.Schema$Revision[];
    try {
      revisions = await this.revisions(fileId);
    } catch (e) {
      console.warn("[corujinha] não consegui ler o histórico de versões:", (e as Error).message);
      return;
    }
    const ours = revisions.findLastIndex((r) => r.md5Checksum === ourEtag);
    if (ours <= 0) return;
    const before = revisions[ours - 1];
    if (!before.md5Checksum || before.md5Checksum === expectedEtag || !before.id) return;
    // A gravação de outra pessoa ficou por baixo da nossa. Se a nossa ainda é a última, devolve a dela.
    console.warn(`[corujinha] gravação simultânea em ${name}: devolvendo a outra versão e pedindo para juntar.`);
    if (ours === revisions.length - 1) {
      const old = await this.drive.revisions.get(
        { fileId, revisionId: before.id, alt: "media" },
        { responseType: "text" },
      );
      await this.drive.files.update({
        fileId,
        media: { mimeType: "application/json", body: Readable.from([String(old.data)]) },
        fields: "id",
        supportsAllDrives: true,
      });
      throw new ConflictError(name, before.md5Checksum);
    }
    throw new ConflictError(name, revisions.at(-1)?.md5Checksum ?? null);
  }

  private async revisions(fileId: string): Promise<drive_v3.Schema$Revision[]> {
    const out: drive_v3.Schema$Revision[] = [];
    let pageToken: string | undefined;
    do {
      const r = await this.drive.revisions.list({ fileId, fields: "nextPageToken, revisions(id,md5Checksum)", pageSize: 1000, pageToken });
      out.push(...(r.data.revisions ?? []));
      pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  }

  /** Dois servidores criaram o mesmo arquivo ao mesmo tempo? Fica o mais antigo. */
  private async assertNotDuplicated(name: string, ourId: string) {
    const files = await this.findByName(name);
    const oldest = files[0];
    if (!oldest?.id || oldest.id === ourId) return;
    await this.drive.files.update({ fileId: ourId, requestBody: { trashed: true }, supportsAllDrives: true });
    this.ids.set(name, oldest.id);
    throw new ConflictError(name, etagOf(oldest));
  }

  async list(prefix: string): Promise<string[]> {
    const listed = this.freshListing() ?? (await this.listFolder());
    return [...listed.keys()].filter((n) => n.startsWith(prefix)).sort();
  }

  /** Lista a pasta inteira numa consulta (do mais antigo para o mais novo; duplicados ficam com o mais antigo). */
  private async listFolder(): Promise<Map<string, FileRef>> {
    const files = new Map<string, FileRef>();
    let pageToken: string | undefined;
    do {
      const r = await this.drive.files.list({
        q: `'${this.folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id,name,version,md5Checksum)",
        orderBy: "createdTime",
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of r.data.files ?? []) {
        if (!f.name || !f.id || files.has(f.name)) continue;
        files.set(f.name, { id: f.id, etag: etagOf(f) });
        this.ids.set(f.name, f.id);
      }
      pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);
    this.listing = { at: Date.now(), files };
    return files;
  }

  async versions(): Promise<Record<string, string>> {
    const files = await this.listFolder();
    return Object.fromEntries([...files].map(([name, f]) => [name, f.etag]));
  }

  async remove(name: string): Promise<void> {
    this.listing = null;
    const m = await this.meta(name, true);
    if (m) await this.drive.files.update({ fileId: m.id, requestBody: { trashed: true }, supportsAllDrives: true });
    this.ids.delete(name);
  }
}

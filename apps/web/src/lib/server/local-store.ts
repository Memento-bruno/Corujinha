import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ConflictError, KeyedMutex, type BlobStore, type StoredBlob } from "./blob-store";

const SAFE_NAME = /^[a-z0-9-]+\.json$/;

/** Fallback local: arquivos em disco (`.data/`), com o mesmo contrato de ETag do Drive. */
export class LocalBlobStore implements BlobStore {
  readonly kind = "local" as const;
  private mutex = new KeyedMutex();

  constructor(private readonly dir: string) {}

  private file(name: string): string {
    if (!SAFE_NAME.test(name)) throw new Error(`Nome de arquivo inválido: ${name}`);
    return path.join(this.dir, name);
  }

  private etagOf(content: string): string {
    return createHash("sha256").update(content).digest("hex").slice(0, 32);
  }

  async read(name: string): Promise<StoredBlob | null> {
    try {
      const content = await fs.readFile(this.file(name), "utf8");
      return { content, etag: this.etagOf(content) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async write(name: string, content: string, expectedEtag: string | null): Promise<{ etag: string }> {
    return this.mutex.run(name, async () => {
      const current = await this.read(name);
      const currentEtag = current?.etag ?? null;
      if (currentEtag !== expectedEtag) throw new ConflictError(name, currentEtag);
      await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
      const tmp = `${this.file(name)}.${randomBytes(6).toString("hex")}.tmp`;
      await fs.writeFile(tmp, content, { encoding: "utf8", mode: 0o600 });
      await fs.rename(tmp, this.file(name));
      return { etag: this.etagOf(content) };
    });
  }

  async list(prefix: string): Promise<string[]> {
    try {
      const names = await fs.readdir(this.dir);
      return names.filter((n) => n.startsWith(prefix) && SAFE_NAME.test(n)).sort();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }

  async versions(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const name of await this.list("")) {
      const blob = await this.read(name);
      if (blob) out[name] = blob.etag;
    }
    return out;
  }

  async remove(name: string): Promise<void> {
    await fs.rm(this.file(name), { force: true });
  }
}

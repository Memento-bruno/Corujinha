import "server-only";
import path from "node:path";
import { isMonthKey, monthOf, addMonths } from "../domain/months";
import type { HouseholdConfig, MonthKey, RecurringDebtsFile, StatementFile } from "../domain/types";
import { defaultConfig, demoConfig, demoRecurring, demoStatements } from "../demo/seed";
import type { BlobStore } from "./blob-store";
import { decryptJson, encryptJson } from "./crypto";
import { DriveBlobStore } from "./drive-store";
import { env, isDemoMode, storageMode } from "./env";
import { LocalBlobStore } from "./local-store";

export const FILES = {
  config: "household-config.json",
  recurring: "recurring-debts.json",
  statement: (month: MonthKey) => `statements-${month}.json`,
};

export interface Versioned<T> {
  data: T;
  /** ETag da versão lida; devolvido na gravação para o controle otimista. null = ainda não existe. */
  etag: string | null;
}

/**
 * DriveDatabaseService: camada de persistência do Corujinha.
 *
 * Lê e grava JSONs particionados numa pasta do Google Drive compartilhada pelo casal
 * (ou no disco local, como fallback). Cada arquivo é criptografado com AES-256-GCM
 * antes de sair do servidor, e toda gravação exige o ETag da versão lida.
 */
export class DriveDatabaseService {
  constructor(
    private readonly store: BlobStore,
    private readonly secret: string | undefined,
  ) {
    if (store.kind === "drive" && !secret) {
      throw new Error("Configure ENCRYPTION_SECRET antes de usar o Google Drive: os dados nunca vão sem criptografia.");
    }
  }

  get kind() {
    return this.store.kind;
  }

  get encrypted() {
    return Boolean(this.secret);
  }

  private async readJson<T>(name: string): Promise<Versioned<T> | null> {
    const blob = await this.store.read(name);
    if (!blob) return null;
    return { data: decryptJson<T>(blob.content, this.secret, name), etag: blob.etag };
  }

  private async writeJson<T>(name: string, data: T, etag: string | null): Promise<Versioned<T>> {
    const content = this.secret ? encryptJson(data, this.secret, name) : JSON.stringify(data, null, 2);
    const r = await this.store.write(name, content, etag);
    return { data, etag: r.etag };
  }

  async getConfig(): Promise<Versioned<HouseholdConfig>> {
    return (await this.readJson<HouseholdConfig>(FILES.config)) ?? { data: defaultConfig(), etag: null };
  }

  async saveConfig(cfg: HouseholdConfig, etag: string | null) {
    return this.writeJson(FILES.config, { ...cfg, updatedAt: new Date().toISOString() }, etag);
  }

  async getRecurring(): Promise<Versioned<RecurringDebtsFile>> {
    return (
      (await this.readJson<RecurringDebtsFile>(FILES.recurring)) ?? {
        data: { schemaVersion: 1, debts: [], updatedAt: new Date(0).toISOString() },
        etag: null,
      }
    );
  }

  async saveRecurring(file: RecurringDebtsFile, etag: string | null) {
    return this.writeJson(FILES.recurring, { ...file, updatedAt: new Date().toISOString() }, etag);
  }

  async getStatement(month: MonthKey): Promise<Versioned<StatementFile>> {
    if (!isMonthKey(month)) throw new Error("Mês inválido");
    return (
      (await this.readJson<StatementFile>(FILES.statement(month))) ?? {
        data: { schemaVersion: 1, month, transactions: [], updatedAt: new Date(0).toISOString() },
        etag: null,
      }
    );
  }

  async saveStatement(file: StatementFile, etag: string | null) {
    if (!isMonthKey(file.month)) throw new Error("Mês inválido");
    return this.writeJson(FILES.statement(file.month), { ...file, updatedAt: new Date().toISOString() }, etag);
  }

  /** ETag atual de cada arquivo, numa só consulta (para os aparelhos verem o que mudou). */
  versions(): Promise<Record<string, string>> {
    return this.store.versions();
  }

  async listStatementMonths(): Promise<MonthKey[]> {
    const names = await this.store.list("statements-");
    return names
      .map((n) => n.replace(/^statements-/, "").replace(/\.json$/, ""))
      .filter(isMonthKey)
      .sort();
  }

  /** Apaga tudo e recria os dados de demonstração (somente no modo local). */
  async resetDemo(): Promise<void> {
    if (this.store.kind !== "local") throw new Error("Restaurar a demo só é permitido no armazenamento local.");
    for (const m of await this.listStatementMonths()) await this.store.remove(FILES.statement(m));
    await this.store.remove(FILES.config);
    await this.store.remove(FILES.recurring);
    await this.seedDemo();
  }

  /** Cria os arquivos de demonstração se o armazenamento local estiver vazio. */
  async seedDemo(): Promise<void> {
    const existing = await this.store.read(FILES.config);
    if (existing) return;
    // Demo termina no mês passado (última fatura fechada)
    const end = addMonths(monthOf(new Date()), -1);
    for (const s of demoStatements(end)) await this.writeJson(FILES.statement(s.month), s, null);
    await this.writeJson(FILES.recurring, demoRecurring(end), null);
    await this.writeJson(FILES.config, demoConfig(), null);
  }
}

let instance: Promise<DriveDatabaseService> | null = null;

/** Instância única por processo, escolhendo Drive ou fallback local conforme o .env. */
export function getDatabase(): Promise<DriveDatabaseService> {
  if (!instance) {
    instance = (async () => {
      if (storageMode() === "drive") {
        return new DriveDatabaseService(new DriveBlobStore(env.driveFolderId!), env.encryptionSecret);
      }
      const dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.dataDir, isDemoMode() ? "demo" : "local");
      const db = new DriveDatabaseService(new LocalBlobStore(dir), env.encryptionSecret);
      if (isDemoMode()) await db.seedDemo();
      return db;
    })();
    instance.catch(() => {
      instance = null;
    });
  }
  return instance;
}

import "server-only";
import path from "node:path";
import { isMonthKey, monthOf, addMonths } from "../domain/months";
import type { HouseholdConfig, MonthKey, RecurringDebtsFile, StatementFile } from "../domain/types";
import { defaultConfig, demoConfig, demoRecurring, demoStatements } from "../demo/seed";
import { ConflictError, StorageUnavailableError, type BlobStore } from "./blob-store";
import { decryptJson, encryptJson } from "./crypto";
import { DriveBlobStore } from "./drive-store";
import { driveMissingVars, env, isDemoMode, isStorageBlocked, storageMode } from "./env";
import { BadRequestError } from "./errors";
import { LocalBlobStore } from "./local-store";

export const FILES = {
  config: "household-config.json",
  recurring: "recurring-debts.json",
  statement: (month: MonthKey) => `statements-${month}.json`,
  backupPrefix: "backup-",
  errorLog: "error-log.json",
};

/** Um erro que aconteceu no app (na tela de alguém ou no servidor). Guardado criptografado, sem valores. */
export interface ErrorLogEntry {
  /** Primeira vez que apareceu. */
  at: string;
  /** Última vez (o mesmo erro repetido só soma em `count`). */
  lastAt: string;
  count: number;
  where: "tela" | "servidor";
  user?: "USER_A" | "USER_B";
  message: string;
  /** Tela ou rota onde aconteceu (sem parâmetros de URL). */
  path?: string;
  detail?: string;
}

export interface ErrorLogFile {
  schemaVersion: 1;
  entries: ErrorLogEntry[];
  updatedAt: string;
}

/** Quantas cópias de segurança guardar (as mais antigas vão para a lixeira do Drive). */
const KEEP_BACKUPS = 15;
const BACKUP_NAME = /^backup-(\d{8})-(\d{6})-([a-z0-9-]{1,40})\.json$/;

export interface BackupFile {
  schemaVersion: 1;
  kind: "backup";
  createdAt: string;
  reason: string;
  config: HouseholdConfig | null;
  recurring: RecurringDebtsFile | null;
  statements: StatementFile[];
}

export interface BackupInfo {
  name: string;
  createdAt: string;
  reason: string;
}

function backupInfo(name: string): BackupInfo | null {
  const m = BACKUP_NAME.exec(name);
  if (!m) return null;
  const [, d, t, reason] = m;
  const createdAt = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`;
  return { name, createdAt, reason };
}

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
    return { data: decryptJson<T>(blob.content, this.secret, name, this.store.kind === "drive"), etag: blob.etag };
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

  async getErrorLog(): Promise<Versioned<ErrorLogFile>> {
    return (
      (await this.readJson<ErrorLogFile>(FILES.errorLog)) ?? {
        data: { schemaVersion: 1, entries: [], updatedAt: new Date(0).toISOString() },
        etag: null,
      }
    );
  }

  async saveErrorLog(file: ErrorLogFile, etag: string | null) {
    return this.writeJson(FILES.errorLog, { ...file, updatedAt: new Date().toISOString() }, etag);
  }

  /** ETag atual de cada arquivo, numa só consulta (para os aparelhos verem o que mudou). */
  versions(): Promise<Record<string, string>> {
    return this.store.versions();
  }

  /**
   * Lista a pasta do Drive numa consulta só. Nos segundos seguintes, ler um arquivo custa uma
   * chamada ao Drive em vez de duas, e meses que não existem nem são consultados.
   */
  async prime(): Promise<void> {
    if (this.store.kind === "drive") await this.store.versions();
  }

  async listStatementMonths(): Promise<MonthKey[]> {
    const names = await this.store.list("statements-");
    return names
      .map((n) => n.replace(/^statements-/, "").replace(/\.json$/, ""))
      .filter(isMonthKey)
      .sort();
  }

  /**
   * Cópia de segurança de tudo (cadastro, contas fixas e todas as faturas) num arquivo só,
   * criptografado como os outros. Feita antes de ações que apagam compras em massa.
   */
  async backup(reason: string): Promise<BackupInfo> {
    const slug = reason.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "manual";
    const months = await this.listStatementMonths();
    const [config, recurring, ...statements] = await Promise.all([
      this.readJson<HouseholdConfig>(FILES.config),
      this.readJson<RecurringDebtsFile>(FILES.recurring),
      ...months.map((m) => this.readJson<StatementFile>(FILES.statement(m))),
    ]);
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const name = `${FILES.backupPrefix}${stamp}-${slug}.json`;
    const file: BackupFile = {
      schemaVersion: 1,
      kind: "backup",
      createdAt: now.toISOString(),
      reason: slug,
      config: config?.data ?? null,
      recurring: recurring?.data ?? null,
      statements: statements.flatMap((s) => (s ? [s.data] : [])),
    };
    try {
      await this.writeJson(name, file, null);
    } catch (e) {
      // Duas cópias no mesmo segundo: a outra já serve.
      if (!(e instanceof ConflictError)) throw e;
    }
    const all = (await this.store.list(FILES.backupPrefix)).filter((n) => BACKUP_NAME.test(n)).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) await this.store.remove(old);
    return backupInfo(name)!;
  }

  async listBackups(): Promise<BackupInfo[]> {
    const names = await this.store.list(FILES.backupPrefix);
    return names
      .map(backupInfo)
      .filter((b): b is BackupInfo => b !== null)
      .sort((a, b) => b.name.localeCompare(a.name));
  }

  /**
   * Volta tudo para como estava na cópia. Antes, faz uma cópia do estado atual (dá para desfazer).
   * Meses que não existiam na cópia ficam como estão.
   */
  async restoreBackup(name: string): Promise<{ files: number; safety: BackupInfo }> {
    if (!backupInfo(name)) throw new BadRequestError("Cópia de segurança inválida.");
    const saved = await this.readJson<BackupFile>(name);
    if (!saved || saved.data.kind !== "backup") throw new BadRequestError("Cópia de segurança não encontrada.");
    const safety = await this.backup("antes-de-restaurar");
    const b = saved.data;
    const targets: [string, unknown][] = [
      ...(b.config ? [[FILES.config, b.config] as [string, unknown]] : []),
      ...(b.recurring ? [[FILES.recurring, b.recurring] as [string, unknown]] : []),
      ...b.statements.filter((s) => isMonthKey(s.month)).map((s) => [FILES.statement(s.month), s] as [string, unknown]),
    ];
    for (const [file, data] of targets) {
      for (let attempt = 0; ; attempt++) {
        const current = await this.store.read(file);
        try {
          await this.writeJson(file, data, current?.etag ?? null);
          break;
        } catch (e) {
          if (!(e instanceof ConflictError) || attempt >= 2) throw e;
        }
      }
    }
    return { files: targets.length, safety };
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
      if (isStorageBlocked()) {
        throw new StorageUnavailableError(
          `O Google Drive não está configurado na Vercel (falta: ${driveMissingVars().join(", ")}). ` +
            "Para não gravar num lugar temporário e perder o que vocês editarem, o app não abriu os dados. " +
            "Coloque a variável de volta na Vercel e faça Redeploy.",
          "DRIVE_MISSING",
        );
      }
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

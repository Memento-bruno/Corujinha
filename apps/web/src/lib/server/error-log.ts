import "server-only";
import { ConflictError } from "./blob-store";
import { getDatabase, type ErrorLogEntry } from "./database";

/** Quantos erros diferentes guardar (os mais antigos saem). */
export const KEEP_ERRORS = 40;
const MAX_MESSAGE = 300;
const MAX_DETAIL = 1500;

export interface NewError {
  where: ErrorLogEntry["where"];
  user?: ErrorLogEntry["user"];
  message: string;
  path?: string;
  detail?: string;
}

/** Tira números longos (valores, ids, dígitos de cartão) e e-mails antes de guardar. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail]")
    .replace(/\d[\d.,]{5,}\d/g, "[número]")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path.split(/[?#]/)[0].slice(0, 120) || undefined;
}

/** Junta o erro novo à lista: o mesmo erro (mesma mensagem e lugar) só aumenta a contagem. */
export function mergeError(entries: ErrorLogEntry[], e: NewError, now = new Date().toISOString()): ErrorLogEntry[] {
  const message = scrub(e.message).slice(0, MAX_MESSAGE) || "Erro sem mensagem";
  const path = cleanPath(e.path);
  const detail = e.detail ? scrub(e.detail).slice(0, MAX_DETAIL) : undefined;
  const same = entries.find((x) => x.message === message && x.where === e.where && x.path === path);
  if (same) {
    const updated: ErrorLogEntry = { ...same, lastAt: now, count: same.count + 1, user: e.user ?? same.user, detail: detail ?? same.detail };
    return [updated, ...entries.filter((x) => x !== same)];
  }
  const entry: ErrorLogEntry = { at: now, lastAt: now, count: 1, where: e.where, message };
  if (e.user) entry.user = e.user;
  if (path) entry.path = path;
  if (detail) entry.detail = detail;
  return [entry, ...entries].slice(0, KEEP_ERRORS);
}

/**
 * Guarda o erro no arquivo error-log.json do Drive (criptografado), para aparecer em Ajustes.
 * Nunca lança: se não der para guardar, o erro só fica no log da Vercel.
 */
export async function recordError(e: NewError): Promise<void> {
  try {
    const db = await getDatabase();
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await db.getErrorLog();
      try {
        await db.saveErrorLog({ ...cur.data, entries: mergeError(cur.data.entries, e) }, cur.etag);
        return;
      } catch (err) {
        if (!(err instanceof ConflictError)) throw err;
      }
    }
  } catch (err) {
    console.error("[corujinha] não consegui guardar o erro no registro:", (err as Error).message);
  }
}

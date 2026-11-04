import "server-only";
import { env } from "../server/env";
import type { PluggyAccount, PluggyBill, PluggyTransaction } from "./pluggy-map";

const BASE = "https://api.pluggy.ai";

let cached: { key: string; expiresAt: number } | null = null;

export class PluggyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "PluggyError";
  }
}

/**
 * Cliente mínimo e SOMENTE LEITURA da API Pluggy (Open Finance).
 * Só usa GETs de contas, transações e faturas — nenhum endpoint de pagamento.
 * O client secret nunca sai do servidor.
 */
async function call(url: string | URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(25_000) });
  } catch {
    throw new PluggyError(0, "Não consegui falar com a Pluggy (sem conexão ou serviço fora do ar). Tente de novo em instantes.");
  }
}

async function apiKey(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.key;
  const res = await call(`${BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: env.pluggyClientId, clientSecret: env.pluggyClientSecret }),
  });
  if (!res.ok) throw new PluggyError(res.status, "A Pluggy recusou o Client ID/Secret. Confira as variáveis PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.");
  const body = (await res.json()) as { apiKey: string };
  // A apiKey vale 2h; renovamos com folga.
  cached = { key: body.apiKey, expiresAt: Date.now() + 100 * 60 * 1000 };
  return body.apiKey;
}

async function get<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const res = await call(url, { headers: { "X-API-KEY": await apiKey() } });
  if (res.status === 401) cached = null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const hint = res.status === 404 ? " (confira o Item ID em Ajustes)" : "";
    throw new PluggyError(res.status, `Pluggy ${res.status} em ${url.pathname}${hint}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function getItem(itemId: string): Promise<{ id: string; status?: string; consentExpiresAt?: string | null }> {
  return get(`/items/${encodeURIComponent(itemId)}`);
}

export async function getCreditAccounts(itemId: string): Promise<PluggyAccount[]> {
  const r = await get<{ results: PluggyAccount[] }>("/accounts", { itemId, type: "CREDIT" });
  return r.results.filter((a) => a.type === "CREDIT");
}

export async function getBills(accountId: string): Promise<PluggyBill[]> {
  try {
    const r = await get<{ results: PluggyBill[] }>("/bills", { accountId, pageSize: "100" });
    return r.results ?? [];
  } catch {
    return []; // nem toda instituição informa faturas; usamos a data da compra
  }
}

/** Transações desde `from` (ISO), paginando pelo cursor da API v2. */
export async function getTransactions(accountId: string, from: string): Promise<PluggyTransaction[]> {
  const all: PluggyTransaction[] = [];
  let after: string | undefined;
  for (let page = 0; page < 50; page++) {
    const r = await get<{ results: PluggyTransaction[]; next?: string | null }>("/v2/transactions", {
      accountId,
      dateFrom: from,
      after,
    });
    all.push(...(r.results ?? []));
    if (!r.next) break;
    // `next` pode vir como cursor ou como URL completa com ?after=
    after = r.next.startsWith("http") ? (new URL(r.next).searchParams.get("after") ?? undefined) : decodeURIComponent(r.next);
    if (!after) break;
  }
  return all;
}

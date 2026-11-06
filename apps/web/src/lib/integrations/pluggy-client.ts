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
    const r = await get<{ results: PluggyBill[] }>("/bills", { accountId });
    return r.results ?? [];
  } catch (e) {
    // Instituição que não informa faturas: usamos a data da compra.
    if (e instanceof PluggyError && (e.status === 400 || e.status === 404)) return [];
    // Falha passageira (rede, Pluggy fora do ar): sem as faturas as compras cairiam no mês errado,
    // então esse cartão fica de fora desta sincronização e nada dele é alterado.
    throw e;
  }
}

/** Transações desde `from` (ISO), paginando pelo cursor da API v2. */
/** Monta o caminho da próxima página a partir do `next` da Pluggy (cursor, "?after=…" ou URL completa). */
export function nextPagePath(path: string, next: string): string {
  if (/^https?:\/\//i.test(next)) {
    const u = new URL(next);
    return u.pathname + u.search;
  }
  if (next.startsWith(path)) return next;
  if (next.startsWith("?") || next.startsWith("&")) return path + "?" + next.replace(/^[?&]/, "");
  if (next.startsWith("/")) return path + next;
  return `${path}?after=${encodeURIComponent(next)}`;
}

export async function getTransactions(accountId: string, from: string): Promise<PluggyTransaction[]> {
  const path = "/v2/transactions";
  const all: PluggyTransaction[] = [];
  let r = await get<{ results: PluggyTransaction[]; next?: string | null }>(path, { accountId, dateFrom: from });
  all.push(...(r.results ?? []));
  for (let page = 1; page < 200 && r.next; page++) {
    // A Pluggy pede para anexar o `next` ao caminho (GET /v2/transactions{next}).
    const nextPath = nextPagePath(path, r.next);
    r = await get(nextPath, nextPath.includes("accountId=") ? {} : { accountId });
    all.push(...(r.results ?? []));
  }
  return all;
}

/**
 * Token de curta duração para abrir o widget Pluggy Connect no navegador.
 * Ele só permite criar/atualizar conexões; o client secret continua no servidor.
 */
export async function createConnectToken(clientUserId: string, itemId?: string): Promise<string> {
  const res = await call(`${BASE}/connect_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": await apiKey() },
    body: JSON.stringify({ ...(itemId ? { itemId } : {}), options: { clientUserId } }),
  });
  if (res.status === 401) cached = null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new PluggyError(res.status, `Pluggy ${res.status} ao criar o connect token: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

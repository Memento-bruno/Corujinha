import type { CardBill, CardTransaction, CreditCard } from "@corujinha/core";
import type { FinanceProvider } from "./types.js";

/**
 * Cliente mínimo da API da Pluggy (https://docs.pluggy.ai), somente leitura.
 *
 * Endpoints usados: POST /auth, POST /connect_token, GET /accounts,
 * GET /bills, GET /transactions, DELETE /items/{id}.
 * Os nomes de campo seguem a documentação pública; confirme no sandbox
 * antes de ir para produção (marcados com "VERIFICAR").
 */
export class PluggyProvider implements FinanceProvider {
  readonly name = "pluggy";
  private apiKey?: { value: string; expiresAt: number };

  constructor(
    private readonly opts: {
      clientId: string;
      clientSecret: string;
      baseUrl?: string;
      fetch?: typeof fetch;
    },
  ) {}

  private get baseUrl() {
    return this.opts.baseUrl ?? "https://api.pluggy.ai";
  }

  private get http() {
    return this.opts.fetch ?? fetch;
  }

  private async key(): Promise<string> {
    if (this.apiKey && this.apiKey.expiresAt > Date.now()) return this.apiKey.value;
    const res = await this.http(`${this.baseUrl}/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: this.opts.clientId, clientSecret: this.opts.clientSecret }),
    });
    if (!res.ok) throw new Error(`Pluggy /auth falhou: ${res.status}`);
    const { apiKey } = (await res.json()) as { apiKey: string };
    // A API key da Pluggy vale 2h; renovamos com folga.
    this.apiKey = { value: apiKey, expiresAt: Date.now() + 90 * 60 * 1000 };
    return apiKey;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.http(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "X-API-KEY": await this.key(), ...init.headers },
    });
    if (!res.ok) throw new Error(`Pluggy ${init.method ?? "GET"} ${path} falhou: ${res.status}`);
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  async createConnectToken({ userId, itemId }: { userId: string; itemId?: string }) {
    return this.request<{ accessToken: string }>("/connect_token", {
      method: "POST",
      body: JSON.stringify({ itemId, options: { clientUserId: userId } }),
    });
  }

  async fetchCardsAndBills({ itemId, ownerId, since }: { itemId: string; ownerId: string; since: string }) {
    const accounts = await this.request<{ results: PluggyAccount[] }>(
      `/accounts?itemId=${encodeURIComponent(itemId)}&type=CREDIT`,
    );
    const cards: CreditCard[] = [];
    const bills: CardBill[] = [];

    for (const acc of accounts.results) {
      const last4 = acc.number?.slice(-4);
      cards.push({
        id: acc.id,
        ownerId,
        institution: acc.marketingName ?? acc.name,
        displayName: last4 ? `${acc.name} final ${last4}` : acc.name,
        last4,
      });

      const [pBills, txs] = await Promise.all([
        this.request<{ results: PluggyBill[] }>(`/bills?accountId=${encodeURIComponent(acc.id)}`),
        this.allTransactions(acc.id, since),
      ]);

      for (const b of pBills.results) {
        bills.push({
          id: b.id,
          cardId: acc.id,
          referenceMonth: b.dueDate.slice(0, 7), // VERIFICAR: mês de referência x vencimento
          dueDate: b.dueDate,
          total: toCents(b.totalAmount),
          minimumPayment: b.minimumPaymentAmount != null ? toCents(b.minimumPaymentAmount) : undefined,
          transactions: txs
            .filter((t) => t.creditCardMetadata?.billId === b.id)
            .map((t) => toTransaction(t, acc.id)),
        });
      }
    }
    return { cards, bills };
  }

  private async allTransactions(accountId: string, since: string): Promise<PluggyTransaction[]> {
    const out: PluggyTransaction[] = [];
    for (let page = 1; ; page++) {
      const r = await this.request<{ results: PluggyTransaction[]; totalPages: number }>(
        `/transactions?accountId=${encodeURIComponent(accountId)}&from=${since}&pageSize=500&page=${page}`,
      );
      out.push(...r.results);
      if (page >= r.totalPages) return out;
    }
  }

  async revokeConnection(itemId: string) {
    await this.request<void>(`/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
  }
}

interface PluggyAccount {
  id: string;
  name: string;
  marketingName?: string;
  number?: string;
  type: string;
}

interface PluggyBill {
  id: string;
  dueDate: string;
  totalAmount: number;
  minimumPaymentAmount?: number | null;
}

interface PluggyTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category?: string | null;
  creditCardMetadata?: {
    billId?: string;
    installmentNumber?: number;
    totalInstallments?: number;
  } | null;
}

function toCents(v: number) {
  return Math.round(v * 100);
}

function toTransaction(t: PluggyTransaction, cardId: string): CardTransaction {
  const m = t.creditCardMetadata;
  return {
    id: t.id,
    cardId,
    date: t.date,
    description: t.description,
    // VERIFICAR: em contas de crédito, a Pluggy retorna compra como valor positivo.
    amount: toCents(t.amount),
    category: t.category ?? undefined,
    installment:
      m?.installmentNumber && m.totalInstallments
        ? { number: m.installmentNumber, total: m.totalInstallments }
        : undefined,
  };
}

import type {
  Allocation,
  CardBill,
  CreditCard,
  MonthlySettlement,
  Person,
  RecurringBill,
  SplitRule,
} from "@corujinha/core";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3333";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error?: string; message?: string },
  ) {
    super(body.message ?? body.error ?? `Erro ${status}`);
  }
}

export function createApi(token: string) {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (res.status === 204) return undefined as T;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, body);
    return body as T;
  }
  const json = (method: string, body?: unknown): RequestInit => ({
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    household: () =>
      call<{ people: Person[]; rule: SplitRule; shares: Record<string, number> | null }>("/household"),
    setIncome: (monthlyIncome: number) => call<Person>("/household/me/income", json("PUT", { monthlyIncome })),
    setRule: (rule: SplitRule) => call("/household/rule", json("PUT", rule)),
    connectToken: () => call<{ accessToken: string }>("/connections/token", json("POST")),
    sync: (itemId: string) =>
      call<{ cards: number; bills: number; consentRevoked: boolean }>(
        `/connections/${encodeURIComponent(itemId)}/sync`,
        json("POST"),
      ),
    bills: (month: string) =>
      call<{ cards: CreditCard[]; bills: CardBill[]; classification: Record<string, Allocation> }>(
        `/bills?month=${month}`,
      ),
    classify: (txId: string, allocation: Allocation) =>
      call(`/transactions/${encodeURIComponent(txId)}/allocation`, json("PUT", allocation)),
    recurring: () => call<{ items: RecurringBill[] }>("/recurring-bills"),
    addRecurring: (bill: Omit<RecurringBill, "id">) => call<RecurringBill>("/recurring-bills", json("POST", bill)),
    deleteRecurring: (id: string) => call(`/recurring-bills/${encodeURIComponent(id)}`, json("DELETE")),
    settlement: (month: string) =>
      call<MonthlySettlement & { month: string }>(`/settlement?month=${month}`),
  };
}

export type Api = ReturnType<typeof createApi>;

/** Mês anterior no formato AAAA-MM (a fatura que fecha agora). */
export function previousMonth(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}

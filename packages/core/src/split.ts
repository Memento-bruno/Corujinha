import type {
  Cents,
  Expense,
  MonthlySettlement,
  Person,
  PersonBalance,
  PersonId,
  RecurringBill,
  SplitRule,
  Transfer,
} from "./types";

export const FULL_BPS = 10_000;

export class SplitError extends Error {
  constructor(
    public readonly code:
      | "NO_PEOPLE"
      | "MISSING_INCOME"
      | "INVALID_SHARES"
      | "UNKNOWN_PERSON",
    message: string,
  ) {
    super(message);
    this.name = "SplitError";
  }
}

/**
 * Converte uma regra de divisão em pesos (pontos-base) por pessoa.
 * A soma dos pesos é sempre exatamente 10000.
 */
export function shareWeights(rule: SplitRule, people: Person[]): Map<PersonId, number> {
  if (people.length === 0) throw new SplitError("NO_PEOPLE", "O grupo não tem pessoas.");

  switch (rule.kind) {
    case "equal":
      return new Map(
        zipLargestRemainder(
          people.map((p) => p.id),
          people.map(() => 1),
          FULL_BPS,
        ),
      );

    case "proportional_income": {
      const missing = people.filter((p) => !p.monthlyIncome || p.monthlyIncome <= 0);
      if (missing.length > 0) {
        throw new SplitError(
          "MISSING_INCOME",
          `Cadastre a remuneração de: ${missing.map((p) => p.name).join(", ")}.`,
        );
      }
      return new Map(
        zipLargestRemainder(
          people.map((p) => p.id),
          people.map((p) => p.monthlyIncome as number),
          FULL_BPS,
        ),
      );
    }

    case "custom": {
      const ids = new Set(people.map((p) => p.id));
      for (const id of Object.keys(rule.sharesBps)) {
        if (!ids.has(id)) throw new SplitError("UNKNOWN_PERSON", `Pessoa desconhecida: ${id}`);
      }
      const weights = new Map<PersonId, number>();
      let sum = 0;
      for (const p of people) {
        const bps = rule.sharesBps[p.id] ?? 0;
        if (!Number.isInteger(bps) || bps < 0) {
          throw new SplitError("INVALID_SHARES", "Percentuais devem ser inteiros não negativos.");
        }
        weights.set(p.id, bps);
        sum += bps;
      }
      if (sum !== FULL_BPS) {
        throw new SplitError("INVALID_SHARES", `Os percentuais somam ${sum / 100}%, e não 100%.`);
      }
      return weights;
    }
  }
}

/**
 * Divide um valor em centavos de acordo com os pesos, garantindo que a soma
 * das partes seja exatamente igual ao total (método do maior resto).
 * Valores negativos (estornos) são divididos da mesma forma, com sinal invertido.
 */
export function allocate(amount: Cents, weights: Map<PersonId, number>): Map<PersonId, Cents> {
  if (!Number.isInteger(amount)) throw new TypeError("O valor deve estar em centavos inteiros.");
  const sign = amount < 0 ? -1 : 1;
  const ids = [...weights.keys()];
  const parts = zipLargestRemainder(ids, ids.map((id) => weights.get(id) ?? 0), Math.abs(amount));
  return new Map(parts.map(([id, v]) => [id, v === 0 ? 0 : sign * v]));
}

/** Percentual de cada pessoa, para exibir na tela (ex.: 58,33%). */
export function describeShares(rule: SplitRule, people: Person[]): Record<PersonId, number> {
  const w = shareWeights(rule, people);
  return Object.fromEntries([...w].map(([id, bps]) => [id, bps / 100]));
}

/** Transforma as contas recorrentes ativas em despesas do mês. */
export function recurringToExpenses(bills: RecurringBill[]): Expense[] {
  return bills
    .filter((b) => b.active)
    .map((b) => ({
      id: `recurring:${b.id}`,
      description: b.description,
      amount: b.amount,
      paidBy: b.paidBy,
      allocation: b.allocation,
      source: "recurring_bill" as const,
    }));
}

/**
 * Fechamento do mês: quanto cada um pagou, quanto deveria pagar e quem
 * transfere quanto para quem.
 */
export function settle(
  people: Person[],
  expenses: Expense[],
  groupRule: SplitRule,
): MonthlySettlement {
  if (people.length === 0) throw new SplitError("NO_PEOPLE", "O grupo não tem pessoas.");
  const ids = new Set(people.map((p) => p.id));
  const paid = new Map<PersonId, Cents>(people.map((p) => [p.id, 0]));
  const owes = new Map<PersonId, Cents>(people.map((p) => [p.id, 0]));
  const weightsCache = new Map<SplitRule, Map<PersonId, number>>();

  let total = 0;
  let sharedTotal = 0;
  let personalTotal = 0;

  for (const e of expenses) {
    if (!ids.has(e.paidBy)) {
      throw new SplitError("UNKNOWN_PERSON", `"${e.description}" foi paga por pessoa desconhecida.`);
    }
    total += e.amount;
    paid.set(e.paidBy, (paid.get(e.paidBy) ?? 0) + e.amount);

    if (e.allocation.type === "personal") {
      const owner = e.allocation.ownerId;
      if (!ids.has(owner)) {
        throw new SplitError("UNKNOWN_PERSON", `"${e.description}" pertence a pessoa desconhecida.`);
      }
      personalTotal += e.amount;
      owes.set(owner, (owes.get(owner) ?? 0) + e.amount);
      continue;
    }

    sharedTotal += e.amount;
    const rule = e.allocation.rule ?? groupRule;
    let weights = weightsCache.get(rule);
    if (!weights) {
      weights = shareWeights(rule, people);
      weightsCache.set(rule, weights);
    }
    for (const [id, part] of allocate(e.amount, weights)) {
      owes.set(id, (owes.get(id) ?? 0) + part);
    }
  }

  const balances: PersonBalance[] = people.map((p) => {
    const pPaid = paid.get(p.id) ?? 0;
    const pOwes = owes.get(p.id) ?? 0;
    return { personId: p.id, paid: pPaid, owes: pOwes, balance: pPaid - pOwes };
  });

  return { total, sharedTotal, personalTotal, balances, transfers: minimalTransfers(balances) };
}

/** Sugere transferências (guloso: maior devedor paga ao maior credor). */
export function minimalTransfers(balances: PersonBalance[]): Transfer[] {
  const debtors = balances
    .filter((b) => b.balance < 0)
    .map((b) => ({ id: b.personId, left: -b.balance }))
    .sort((a, b) => b.left - a.left);
  const creditors = balances
    .filter((b) => b.balance > 0)
    .map((b) => ({ id: b.personId, left: b.balance }))
    .sort((a, b) => b.left - a.left);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const amount = Math.min(d.left, c.left);
    if (amount > 0) transfers.push({ from: d.id, to: c.id, amount });
    d.left -= amount;
    c.left -= amount;
    if (d.left === 0) i++;
    if (c.left === 0) j++;
  }
  return transfers;
}

/** Maior resto: distribui `total` unidades inteiras proporcionalmente aos pesos. */
function zipLargestRemainder<K>(keys: K[], weights: number[], total: number): [K, number][] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new SplitError("INVALID_SHARES", "A soma dos pesos deve ser positiva.");
  const raw = weights.map((w) => (w * total) / sum);
  const floors = raw.map(Math.floor);
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, idx) => ({ idx, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.idx - b.idx);
  for (const { idx } of order) {
    if (rest <= 0) break;
    floors[idx]! += 1;
    rest--;
  }
  return keys.map((k, idx) => [k, floors[idx]!]);
}

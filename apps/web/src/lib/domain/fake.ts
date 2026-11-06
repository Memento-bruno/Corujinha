/**
 * Valores fictícios: mostra as mesmas compras, contas e faturas, mas com valores trocados.
 * Serve para mostrar o app ou tirar print sem expor quanto o casal gasta.
 *
 * - Só muda o que aparece na tela: nada disso é salvo no Drive.
 * - Cada estabelecimento ganha um fator próprio (a mesma loja tem o mesmo fator em todo mês),
 *   então parcelas, recorrentes e previstas continuam batendo entre si, e todos os totais,
 *   gráficos e o acerto são somas dos valores fictícios (as contas fecham).
 * - O fator depende de uma "semente" sorteada uma vez por aparelho: quem vê a tela não
 *   consegue voltar ao valor real a partir do código, que é público.
 */
import type { Cents, HouseholdConfig, MonthSnapshot, RecurringDebt, RecurringDebtsFile, StatementFile, Transaction } from "./types";

/** Hash FNV-1a de 32 bits, misturado com a semente. Retorna um número entre 0 e 1. */
function unit(seed: number, key: string): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Mistura final para espalhar bem chaves parecidas.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

/** Escala geral (0,55 a 1,6): metas, renda, tetos, faturas do banco e meses fechados. */
export function globalFactor(seed: number): number {
  return 0.55 + unit(seed, "__global__") * 1.05;
}

/** Fator de um item: escala geral vezes uma variação própria (0,6 a 1,5). */
export function itemFactor(seed: number, key: string): number {
  return globalFactor(seed) * (0.6 + unit(seed, key) * 0.9);
}

function scale(cents: Cents, factor: number): Cents {
  if (!cents) return cents;
  const v = Math.round(cents * factor);
  // Valor que existe nunca vira zero (sumiria da lista ou mudaria o sinal).
  return v === 0 ? Math.sign(cents) : v;
}

/** Chave de uma compra/conta: o estabelecimento, para a mesma loja ter o mesmo fator sempre. */
function keyOf(x: { merchantKey?: string; description: string }): string {
  const k = x.merchantKey && x.merchantKey !== "desconhecido" ? x.merchantKey : x.description.trim().toLowerCase();
  return `m:${k}`;
}

export function fakeAmount(seed: number, x: { amount: Cents; merchantKey?: string; description: string }): Cents {
  return scale(x.amount, itemFactor(seed, keyOf(x)));
}

/** Valor avulso na escala geral (ex.: histórico de meses fechados). */
export function fakeGlobal(seed: number, cents: Cents): Cents {
  return scale(cents, globalFactor(seed));
}

export function fakeTransaction(seed: number, t: Transaction): Transaction {
  return { ...t, amount: fakeAmount(seed, t) };
}

export function fakeDebt(seed: number, d: RecurringDebt): RecurringDebt {
  return { ...d, amount: fakeAmount(seed, d) };
}

/** Troca todo número de um objeto (só centavos dentro dele) pela escala geral. */
function scaleDeep<T>(v: T, f: number): T {
  if (typeof v === "number") return scale(v, f) as T;
  if (Array.isArray(v)) return v.map((x) => scaleDeep(x, f)) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = scaleDeep(x, f);
    return out as T;
  }
  return v;
}

function fakeSnapshot(seed: number, s: MonthSnapshot): MonthSnapshot {
  const f = globalFactor(seed);
  return {
    ...s,
    settlement: scaleDeep(s.settlement, f),
    totalStatements: scale(s.totalStatements, f),
    totalRecurring: scale(s.totalRecurring, f),
  };
}

export function fakeStatement(seed: number, s: StatementFile): StatementFile {
  const g = globalFactor(seed);
  return {
    ...s,
    transactions: s.transactions.map((t) => fakeTransaction(seed, t)),
    snapshot: s.snapshot && fakeSnapshot(seed, s.snapshot),
    bankBills:
      s.bankBills &&
      Object.fromEntries(Object.entries(s.bankBills).map(([k, b]) => [k, { ...b, total: scale(b.total, g), paid: scale(b.paid, g) }])),
  };
}

export function fakeRecurring(seed: number, r: RecurringDebtsFile): RecurringDebtsFile {
  return { ...r, debts: r.debts.map((d) => fakeDebt(seed, d)) };
}

export function fakeConfig(seed: number, c: HouseholdConfig): HouseholdConfig {
  const g = globalFactor(seed);
  const mapCents = <K extends string>(o: Partial<Record<K, Cents>> | undefined) =>
    o && (Object.fromEntries(Object.entries(o).map(([k, v]) => [k, scale(v as Cents, g)])) as Partial<Record<K, Cents>>);
  return {
    ...c,
    monthlyGoal: scale(c.monthlyGoal, g),
    incomes: mapCents(c.incomes),
    sectorBudgets: mapCents(c.sectorBudgets) ?? {},
  };
}

/**
 * Proteção do Drive: com os valores fictícios ligados, nenhuma gravação pode mudar um valor
 * (nem criar item com valor), porque o que está na tela não é o valor real.
 * Mudar divisão, setor, marcar como paga etc. continua liberado.
 */
export function changesAmounts<T extends { id: string; amount: Cents }>(before: readonly T[], after: readonly T[]): boolean {
  const old = new Map(before.map((x) => [x.id, x.amount]));
  return after.some((x) => old.get(x.id) !== x.amount);
}

/**
 * Um formulário pode devolver o item com o valor fictício que estava na tela (ex.: só mudou o nome
 * da conta). Nesse caso o valor não mudou de verdade: volta para o real antes de salvar.
 */
export function restoreAmounts<T extends { id: string; amount: Cents; merchantKey?: string; description: string }>(
  seed: number,
  before: readonly T[],
  after: T[],
): T[] {
  const old = new Map(before.map((x) => [x.id, x]));
  return after.map((x) => {
    const real = old.get(x.id);
    return real && x.amount !== real.amount && x.amount === fakeAmount(seed, real) ? { ...x, amount: real.amount } : x;
  });
}

export function configChangesAmounts(before: HouseholdConfig, after: HouseholdConfig): boolean {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
  return before.monthlyGoal !== after.monthlyGoal || !same(before.incomes, after.incomes) || !same(before.sectorBudgets, after.sectorBudgets);
}

export function newFakeSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

/**
 * Números da tela Início: gasto do mês (cartão + contas fora do cartão), previsão dos
 * próximos meses, composição por tipo de gasto, quanto da renda os gastos usam e o
 * índice de saúde financeira. Tudo por regras simples e determinísticas, sem IA.
 */
import { addMonths, monthDiff } from "../domain/months";
import type { BankBill, Cents, MonthKey, RecurringDebt, Transaction, UserId } from "../domain/types";
import { sumCents } from "./analytics";
import { withPredicted } from "./recurring";
import { recurringToExpenses } from "./settlement";

/** Contas fora do cartão (boleto, aluguel, condomínio...) ativas no mês. */
export function billsTotal(debts: RecurringDebt[], month: MonthKey): Cents {
  return sumCents(recurringToExpenses(debts, month));
}

/**
 * Parcelas que já existem e caem em `month`, a partir das compras parceladas de `baseMonth`.
 * Ex.: compra 03/10 em janeiro vira 05/10 em março.
 */
export function projectedInstallmentTxs(baseTxs: Transaction[], baseMonth: MonthKey, month: MonthKey): Transaction[] {
  const k = monthDiff(baseMonth, month);
  if (k <= 0) return [];
  return baseTxs
    .filter((t) => t.installment && t.installment.current + k <= t.installment.total)
    .map((t) => ({
      ...t,
      id: `${t.id}:+${k}`,
      installment: { current: t.installment!.current + k, total: t.installment!.total },
      predictedFrom: t.predictedFrom ?? "installment",
    }));
}

/**
 * Compras de cartão de um mês. Mês que o banco ainda não trouxe (a fatura em aberto antes da
 * primeira compra chegar, ou os meses depois dela) é previsto: parcelas que já existem + compras
 * que se repetem todo mês. Meses que já passaram ficam como estão.
 */
export function cardTxsFor(
  byMonth: Record<MonthKey, Transaction[]>,
  debts: RecurringDebt[],
  month: MonthKey,
  openMonth: MonthKey,
): Transaction[] {
  const known = byMonth[month];
  if (known?.some((t) => !t.predictedFrom) || month < openMonth) return known ?? withPredicted(debts, month, []);
  // Base da previsão: o último mês até aqui que tem compras reais.
  let base: MonthKey | null = null;
  for (let i = 1; i <= 12 && !base; i++) {
    const m = addMonths(month, -i);
    if (byMonth[m]?.some((t) => !t.predictedFrom)) base = m;
  }
  const projected = base ? projectedInstallmentTxs(byMonth[base].filter((t) => !t.predictedFrom), base, month) : [];
  return withPredicted(debts, month, projected);
}

export type MonthStatus = "ok" | "over" | "open" | "forecast" | "empty";

export interface MonthSpend {
  month: MonthKey;
  card: Cents;
  bills: Cents;
  total: Cents;
  status: MonthStatus;
  forecast: boolean;
}

export function monthSpend(cardTxs: Transaction[], debts: RecurringDebt[], month: MonthKey, openMonth: MonthKey, goal: Cents): MonthSpend {
  const card = sumCents(cardTxs);
  const bills = billsTotal(debts, month);
  const total = card + bills;
  const forecast = month > openMonth;
  let status: MonthStatus;
  if (month === openMonth) status = "open";
  else if (forecast) status = "forecast";
  else if (!cardTxs.length && !bills) status = "empty";
  else status = goal > 0 && total > goal ? "over" : "ok";
  return { month, card, bills, total, status, forecast };
}

// ---------------------------------------------------------------------------
// Do que é feito cada mês
// ---------------------------------------------------------------------------

export const COMPOSITION = [
  { key: "contas", label: "Contas fixas e boletos", color: "#3f3f46", text: "#fff" },
  { key: "parcelas", label: "Parcelas", color: "#4f52d6", text: "#fff" },
  { key: "mercado", label: "Mercado", color: "#5fd3ad", text: "#064e3b" },
  { key: "restaurantes", label: "Restaurantes", color: "#f59e0b", text: "#451a03" },
  { key: "compras", label: "Compras", color: "#f472b6", text: "#500724" },
  { key: "outros", label: "Outros", color: "#cbd5e1", text: "#1e293b" },
] as const;

export type CompositionKey = (typeof COMPOSITION)[number]["key"];

export function monthComposition(cardTxs: Transaction[], debts: RecurringDebt[], month: MonthKey): Record<CompositionKey, Cents> {
  const out: Record<CompositionKey, Cents> = { contas: billsTotal(debts, month), parcelas: 0, mercado: 0, restaurantes: 0, compras: 0, outros: 0 };
  for (const t of cardTxs) {
    let k: CompositionKey;
    if (t.installment && t.installment.total > 1) k = "parcelas";
    else if (t.category === "mercado") k = "mercado";
    else if (t.category === "restaurantes" || t.category === "delivery" || t.category === "lanches") k = "restaurantes";
    else if (t.category === "compras") k = "compras";
    else if (t.category === "moradia") k = "contas";
    else k = "outros";
    out[k] += t.amount;
  }
  for (const k of Object.keys(out) as CompositionKey[]) out[k] = Math.max(0, out[k]);
  return out;
}

// ---------------------------------------------------------------------------
// Renda
// ---------------------------------------------------------------------------

export interface IncomeUsage {
  /** Percentual da renda do casal (null se faltar algum salário). */
  couple: number | null;
  perUser: Record<UserId, number | null>;
  /** Renda total do casal (centavos). Nunca exibir: só para cálculo. */
  totalIncome: Cents;
}

export function incomeUsage(spent: Cents, fairShare: Record<UserId, Cents>, incomes: Partial<Record<UserId, Cents>> | undefined): IncomeUsage {
  const a = incomes?.USER_A ?? 0;
  const b = incomes?.USER_B ?? 0;
  const pct = (part: Cents, base: Cents) => (base > 0 ? (part / base) * 100 : null);
  return {
    couple: a > 0 && b > 0 ? pct(spent, a + b) : null,
    perUser: { USER_A: pct(fairShare.USER_A, a), USER_B: pct(fairShare.USER_B, b) },
    totalIncome: a + b,
  };
}

// ---------------------------------------------------------------------------
// Saúde financeira (0-100)
// ---------------------------------------------------------------------------

export interface HealthFactor {
  key: "renda" | "meta" | "parcelas" | "contas";
  label: string;
  /** Valor mostrado (percentual). */
  value: number;
  /** Pontos de 0 a 25. */
  points: number;
}

export interface FinancialHealth {
  score: number;
  label: "Excelente" | "Boa" | "Atenção" | "Crítica";
  factors: HealthFactor[];
  /** Fator que mais tira pontos (null se nenhum tira). */
  worst: HealthFactor | null;
}

/** 25 pontos até `good`, cai em linha reta até 0 em `bad`. */
function points(ratio: number, good: number, bad: number): number {
  if (ratio <= good) return 25;
  if (ratio >= bad) return 0;
  return 25 * (1 - (ratio - good) / (bad - good));
}

/** Quanto das faturas do banco já foi pago (1 = tudo). Sem informação do banco conta como em dia. */
export function billsPaidRatio(bills: Record<string, BankBill> | undefined): number {
  const list = Object.values(bills ?? {});
  const total = list.reduce((s, b) => s + Math.max(0, b.total), 0);
  if (!list.length || total <= 0) return 1;
  if (list.every((b) => b.status === "paga")) return 1;
  return Math.min(1, list.reduce((s, b) => s + Math.max(0, b.paid), 0) / total);
}

/**
 * "Contas pagas em dia": soma, pelo valor, as faturas de cartão do mês anterior (pelo banco ou pela
 * marca "Já paguei") e as contas fora do cartão do mês que já venceram. Conta que venceu e não foi
 * marcada como paga puxa o número para baixo. Sem nada vencido, conta como em dia.
 */
export function onTimeRatio(input: {
  /** Faturas do banco do mês anterior (as que vencem neste mês). */
  bankBills?: Record<string, BankBill>;
  bankBillsMonth: MonthKey;
  /** Marcas "Já paguei" das faturas ("cartão|mês"). */
  paidCardBills?: string[];
  debts: RecurringDebt[];
  month: MonthKey;
  /** Hoje ("YYYY-MM-DD", horário de Brasília). */
  today: string;
}): number {
  const marks = new Set(input.paidCardBills ?? []);
  let due = 0;
  let paid = 0;
  for (const [cardId, b] of Object.entries(input.bankBills ?? {})) {
    const total = Math.max(0, b.total);
    if (!total) continue;
    due += total;
    paid += b.status === "paga" || marks.has(`${cardId}|${input.bankBillsMonth}`) ? total : Math.min(total, Math.max(0, b.paid));
  }
  const [y, m] = input.month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (const e of recurringToExpenses(input.debts, input.month)) {
    const d = input.debts.find((x) => `recurring:${x.id}` === e.id);
    if (!d || e.amount <= 0) continue;
    const dueDate = `${input.month}-${String(Math.min(d.dueDay, lastDay)).padStart(2, "0")}`;
    if (dueDate >= input.today) continue; // ainda não venceu
    due += e.amount;
    if (d.paidMonths?.includes(input.month)) paid += e.amount;
  }
  return due > 0 ? Math.min(1, paid / due) : 1;
}

export function financialHealth(input: {
  spent: Cents;
  goal: Cents;
  income: Cents;
  /** Parcelas que já existem para o mês seguinte. */
  futureInstallments: Cents;
  paidRatio: number;
}): FinancialHealth {
  const { spent, goal, income, futureInstallments, paidRatio } = input;
  const factors: HealthFactor[] = [];
  if (income > 0) {
    const r = spent / income;
    factors.push({ key: "renda", label: "Renda usada no mês", value: r * 100, points: points(r, 0.5, 1) });
  }
  if (goal > 0) {
    const r = spent / goal;
    factors.push({ key: "meta", label: "Meta do mês usada", value: r * 100, points: points(r, 0.8, 1.3) });
  }
  const base = income > 0 ? income : goal;
  if (base > 0) {
    const r = futureInstallments / base;
    factors.push({
      key: "parcelas",
      label: income > 0 ? "Renda presa em parcelas futuras" : "Meta presa em parcelas futuras",
      value: r * 100,
      points: points(r, 0.1, 0.4),
    });
  }
  factors.push({ key: "contas", label: "Contas pagas em dia", value: paidRatio * 100, points: 25 * paidRatio });
  const score = Math.round((factors.reduce((s, f) => s + f.points, 0) / (factors.length * 25)) * 100);
  const label = score >= 85 ? "Excelente" : score >= 65 ? "Boa" : score >= 40 ? "Atenção" : "Crítica";
  const worst = [...factors].sort((a, b) => a.points - b.points)[0];
  return { score, label, factors, worst: worst && worst.points < 25 ? worst : null };
}

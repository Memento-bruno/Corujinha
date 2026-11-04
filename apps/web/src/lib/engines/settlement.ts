/**
 * Motor de Divisão e Encontro de Contas (compensação automática).
 *
 * Para cada despesa calculamos a parte de A e a parte de B (em centavos inteiros,
 * sem perder nenhum centavo). Quem pagou passa a ter um CRÉDITO contra o outro
 * igual à parte do outro. No fim, os créditos cruzados se abatem e sobra uma
 * única transferência líquida.
 *
 *   créditoA = (parte de B nas compras conjuntas pagas por A)
 *            + (compras individuais de B no cartão de A)
 *            + (parte de B nas recorrentes pagas por A)
 *   créditoB = espelho
 *   acerto   = |créditoA − créditoB|, de quem tem menos crédito para quem tem mais.
 */
import type {
  CreditBreakdown,
  Expense,
  RecurringDebt,
  MonthKey,
  SettlementResult,
  ShareResult,
  Split,
  Transaction,
  UserId,
} from "../domain/types";
import { monthDiff } from "../domain/months";

export class SplitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitValidationError";
  }
}

/** Percentual de A (0-100) para um split, dado o padrão do casal. */
export function percentAFor(split: Split, defaultPercentA: number): number {
  switch (split.type) {
    case "SHARED_DEFAULT":
      return defaultPercentA;
    case "SHARED_CUSTOM": {
      const p = split.percentA;
      if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 100) {
        throw new SplitValidationError("Percentual customizado deve estar entre 0 e 100.");
      }
      return p;
    }
    case "INDIVIDUAL_A":
      return 100;
    case "INDIVIDUAL_B":
      return 0;
  }
}

/**
 * Divide um valor entre A e B. A soma das partes é sempre exatamente o valor.
 * Arredondamento: a parte de A é arredondada "meio para cima" em valor absoluto,
 * B fica com o restante. Estornos (negativos) seguem a mesma divisão.
 */
export function splitAmount(amount: number, split: Split, defaultPercentA: number): ShareResult {
  if (!Number.isInteger(amount)) throw new SplitValidationError("Valores devem estar em centavos inteiros.");
  const pA = percentAFor(split, defaultPercentA);
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  // Trabalhamos em pontos-base (x100) para aceitar percentuais com 2 casas sem erro de float.
  const bps = Math.round(pA * 100);
  const absA = Math.floor((abs * bps + 5000) / 10000);
  const shareA = sign * absA || 0;
  const shareB = amount - shareA || 0;
  return { shareA, shareB };
}

function emptyBreakdown(): CreditBreakdown {
  return { sharedCard: 0, individualOnMyCard: 0, sharedRecurring: 0, individualRecurring: 0, total: 0 };
}

export function transactionsToExpenses(txs: Transaction[]): Expense[] {
  return txs.map((t) => ({
    id: t.id,
    description: t.description,
    amount: t.amount,
    paidBy: t.paidBy,
    split: t.split,
    origin: "CARD" as const,
  }));
}

/** A dívida recorrente vale neste mês? (ativa, já começou e ainda tem parcelas). */
export function isDebtActiveIn(debt: RecurringDebt, month: MonthKey): boolean {
  if (!debt.active) return false;
  const elapsed = monthDiff(debt.startMonth, month);
  if (elapsed < 0) return false;
  if (debt.totalInstallments && elapsed >= debt.totalInstallments) return false;
  return true;
}

export function recurringToExpenses(debts: RecurringDebt[], month: MonthKey): Expense[] {
  return debts
    .filter((d) => isDebtActiveIn(d, month))
    .map((d) => ({
      id: `recurring:${d.id}`,
      description: d.description,
      amount: d.amount,
      paidBy: d.paidBy,
      split: d.split,
      origin: "RECURRING" as const,
    }));
}

export function settle(expenses: Expense[], defaultPercentA: number): SettlementResult {
  const paid: Record<UserId, number> = { USER_A: 0, USER_B: 0 };
  const fairShare: Record<UserId, number> = { USER_A: 0, USER_B: 0 };
  const credits: Record<UserId, CreditBreakdown> = { USER_A: emptyBreakdown(), USER_B: emptyBreakdown() };
  let grossTotal = 0;

  for (const e of expenses) {
    const { shareA, shareB } = splitAmount(e.amount, e.split, defaultPercentA);
    grossTotal += e.amount;
    paid[e.paidBy] += e.amount;
    fairShare.USER_A += shareA;
    fairShare.USER_B += shareB;

    const otherShare = e.paidBy === "USER_A" ? shareB : shareA;
    if (otherShare === 0) continue;
    const c = credits[e.paidBy];
    const individual = e.split.type === "INDIVIDUAL_A" || e.split.type === "INDIVIDUAL_B";
    if (e.origin === "CARD") {
      if (individual) c.individualOnMyCard += otherShare;
      else c.sharedCard += otherShare;
    } else {
      if (individual) c.individualRecurring += otherShare;
      else c.sharedRecurring += otherShare;
    }
    c.total += otherShare;
  }

  const a = credits.USER_A.total;
  const b = credits.USER_B.total;
  const crossOffset = Math.min(a, b);
  const net = a - b;
  const transfer =
    net === 0
      ? null
      : net > 0
        ? { from: "USER_B" as const, to: "USER_A" as const, amount: net }
        : { from: "USER_A" as const, to: "USER_B" as const, amount: -net };

  return { grossTotal, paid, fairShare, credits, crossOffset, transfer };
}

/** Atalho: encontro de contas de um mês a partir das transações e das recorrentes. */
export function settleMonth(
  month: MonthKey,
  transactions: Transaction[],
  debts: RecurringDebt[],
  defaultPercentA: number,
): SettlementResult {
  return settle(
    [...transactionsToExpenses(transactions), ...recurringToExpenses(debts, month)],
    defaultPercentA,
  );
}

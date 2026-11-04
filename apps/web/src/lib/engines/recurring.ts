/**
 * Compras recorrentes no cartão: previsão nas faturas que o banco ainda não trouxe.
 *
 * Uma recorrente do tipo "CARTAO" diz: "todo mês, esse estabelecimento cobra nesse cartão".
 * Em cada mês em que ela vale, se a fatura daquele mês ainda não tem uma compra do mesmo
 * estabelecimento no mesmo cartão, mostramos uma compra "prevista" com o valor cadastrado.
 * Assim que a compra real chega, a prevista some sozinha.
 */
import type { MonthKey, RecurringDebt, Transaction } from "../domain/types";
import { isDebtActiveIn } from "./settlement";

export const PREDICTED_TAG = "Prevista";

export function isCardRecurring(debt: RecurringDebt): boolean {
  return debt.kind === "CARTAO" && Boolean(debt.cardId && debt.merchantKey);
}

/** A recorrente de cartão que corresponde a esta compra (mesmo cartão + mesmo estabelecimento). */
export function cardRecurringFor(debts: RecurringDebt[], tx: Pick<Transaction, "cardId" | "merchantKey">): RecurringDebt | undefined {
  if (!tx.merchantKey) return undefined;
  return debts.find((d) => isCardRecurring(d) && d.cardId === tx.cardId && d.merchantKey === tx.merchantKey);
}

function dateIn(month: MonthKey, day: number): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(Math.max(1, day), last)).padStart(2, "0")}`;
}

/** Compras previstas de um mês: recorrentes de cartão ativas que ainda não vieram na fatura. */
export function predictCardRecurring(debts: RecurringDebt[], month: MonthKey, txs: Transaction[]): Transaction[] {
  const out: Transaction[] = [];
  for (const d of debts) {
    if (!isCardRecurring(d) || !isDebtActiveIn(d, month)) continue;
    const arrived = txs.some((t) => t.cardId === d.cardId && t.merchantKey === d.merchantKey && t.amount > 0);
    if (arrived) continue;
    out.push({
      id: `prevista:${d.id}:${month}`,
      date: dateIn(month, d.dueDay),
      description: d.description,
      merchantKey: d.merchantKey!,
      amount: d.amount,
      cardId: d.cardId!,
      paidBy: d.paidBy,
      category: d.category,
      tags: [PREDICTED_TAG],
      split: d.split,
      source: "manual",
      predictedFrom: d.id,
    });
  }
  return out;
}

/** Fatura do mês com as compras recorrentes previstas incluídas. */
export function withPredicted(debts: RecurringDebt[], month: MonthKey, txs: Transaction[]): Transaction[] {
  const predicted = predictCardRecurring(debts, month, txs);
  return predicted.length ? [...txs, ...predicted] : txs;
}

/**
 * Compras novas que chegam do banco herdam a divisão e o setor da recorrente correspondente,
 * para o casal não precisar ajustar a mesma compra todo mês.
 */
export function applyCardRecurring(debts: RecurringDebt[], tx: Transaction): Transaction {
  const d = cardRecurringFor(debts, tx);
  if (!d || !d.active || tx.amount <= 0) return tx;
  return { ...tx, split: d.split, category: d.category };
}

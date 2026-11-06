/**
 * Parcelas: quando cada parcelamento termina e quanto sobra a mais nos meses seguintes.
 * Puramente matemático (sem IA), a partir das compras parceladas do mês.
 */
import { addMonths } from "../domain/months";
import type { Cents, MonthKey, Transaction, UserId } from "../domain/types";

export interface EndingInstallment {
  id: string;
  description: string;
  paidBy: UserId;
  amount: Cents;
  /** Parcela atual e total (ex.: 3 de 10). */
  current: number;
  total: number;
  /** Último mês em que a parcela aparece na fatura. */
  lastMonth: MonthKey;
}

export interface FreedMonth {
  month: MonthKey;
  /** Quanto deixa de sair, comparado ao mês de referência. */
  freed: Cents;
  /** Parcelamentos que terminaram no mês anterior a este (ou seja, saem a partir deste). */
  ending: EndingInstallment[];
}

export function endingInstallments(txs: Transaction[], month: MonthKey): EndingInstallment[] {
  return txs
    .filter((t) => t.installment && t.installment.total > 1 && t.amount > 0 && !t.predictedFrom)
    .map((t) => ({
      id: t.id,
      description: t.description,
      paidBy: t.paidBy,
      amount: t.amount,
      current: t.installment!.current,
      total: t.installment!.total,
      lastMonth: addMonths(month, t.installment!.total - t.installment!.current),
    }))
    .sort((a, b) => a.lastMonth.localeCompare(b.lastMonth) || b.amount - a.amount);
}

/** Para os próximos `horizon` meses: quanto fica livre por causa das parcelas que acabaram. */
export function freedByMonth(txs: Transaction[], month: MonthKey, horizon = 12): FreedMonth[] {
  const list = endingInstallments(txs, month);
  const out: FreedMonth[] = [];
  for (let i = 1; i <= horizon; i++) {
    const m = addMonths(month, i);
    const prev = addMonths(m, -1);
    const ended = list.filter((x) => x.lastMonth < m);
    out.push({
      month: m,
      freed: ended.reduce((s, x) => s + x.amount, 0),
      ending: list.filter((x) => x.lastMonth === prev),
    });
  }
  return out;
}

/** Soma das parcelas já contratadas que caem em `target` (a partir das compras de `month`). */
export function committedIn(txs: Transaction[], month: MonthKey, target: MonthKey): Cents {
  return endingInstallments(txs, month)
    .filter((x) => x.lastMonth >= target)
    .reduce((s, x) => s + x.amount, 0);
}

/** As duas são parcelas da mesma compra? (mesmo cartão, loja, nº de parcelas e mês da 1ª parcela). */
export function isSamePurchase(aMonth: MonthKey, a: Transaction, bMonth: MonthKey, b: Transaction): boolean {
  const i = a.installment;
  const j = b.installment;
  if (!i || !j || i.total < 2 || i.total !== j.total) return false;
  if (a.cardId !== b.cardId || a.merchantKey !== b.merchantKey) return false;
  return addMonths(aMonth, -i.current) === addMonths(bMonth, -j.current);
}

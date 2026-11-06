import { addMonths } from "../domain/months";
import type { MonthKey, Transaction } from "../domain/types";

/** As duas são parcelas da mesma compra? (mesmo cartão, loja, nº de parcelas e mês da 1ª parcela). */
export function isSamePurchase(aMonth: MonthKey, a: Transaction, bMonth: MonthKey, b: Transaction): boolean {
  const i = a.installment;
  const j = b.installment;
  if (!i || !j || i.total < 2 || i.total !== j.total) return false;
  if (a.cardId !== b.cardId || a.merchantKey !== b.merchantKey) return false;
  return addMonths(aMonth, -i.current) === addMonths(bMonth, -j.current);
}

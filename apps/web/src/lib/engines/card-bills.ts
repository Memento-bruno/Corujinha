/**
 * Faturas do mês por pessoa: quanto é, se já foi paga e o que falta pagar.
 * A marca "Já paguei" é a mesma dos lembretes de vencimento (config.paidCardBills = "cartão|mês").
 */
import { cardGroups, rootCardId } from "../domain/card-groups";
import { cutoffMonth } from "../domain/closing";
import type { BankBill, Cents, ClosingCutoff, CreditCard, MonthKey, Transaction, UserId } from "../domain/types";

export type CardBillStatus = "paga-banco" | "paga" | "fechada" | "parcial" | "pendente";

export interface CardBillRow {
  card: CreditCard;
  /** Chave da marca "Já paguei". */
  key: string;
  total: Cents;
  /** Quanto o banco diz que já foi pago. */
  bankPaid: Cents;
  dueDate?: string;
  status: CardBillStatus;
  /** O total veio do banco (senão é a soma das compras). */
  fromBank: boolean;
}

export interface OwnerBills {
  owner: UserId;
  rows: CardBillRow[];
  total: Cents;
  pending: Cents;
  pendingCount: number;
}

/** Chave da marca "Já paguei" de uma fatura de cartão. */
export const cardBillKey = (cardId: string, month: MonthKey) => `${cardId}|${month}`;

/** A fatura ficou dentro do fechamento por data (venceu até a data, então já foi acertada). */
export function billInClosing(month: MonthKey, dueDate: string | undefined, c: ClosingCutoff | undefined): boolean {
  if (!c) return false;
  if (dueDate) return dueDate <= c.date;
  return month < cutoffMonth(c);
}

export function isSettledStatus(s: CardBillStatus): boolean {
  return s === "paga" || s === "paga-banco" || s === "fechada";
}

export function cardBillsByOwner(input: {
  month: MonthKey;
  cards: CreditCard[];
  transactions: Transaction[];
  bankBills?: Record<string, BankBill>;
  marks?: string[];
  closing?: ClosingCutoff;
}): Record<UserId, OwnerBills> {
  const { month, cards, transactions, bankBills = {}, closing } = input;
  const marks = new Set(input.marks ?? []);
  const sums = new Map<string, Cents>();
  for (const t of transactions) {
    if (t.predictedFrom) continue;
    const root = rootCardId(t.cardId, cards);
    sums.set(root, (sums.get(root) ?? 0) + t.amount);
  }
  const out: Record<UserId, OwnerBills> = {
    USER_A: { owner: "USER_A", rows: [], total: 0, pending: 0, pendingCount: 0 },
    USER_B: { owner: "USER_B", rows: [], total: 0, pending: 0, pendingCount: 0 },
  };
  for (const { card } of cardGroups(cards)) {
    const b = bankBills[card.id];
    const total = b ? b.total : (sums.get(card.id) ?? 0);
    if (total <= 0) continue;
    const key = cardBillKey(card.id, month);
    const status: CardBillStatus =
      b?.status === "paga"
        ? "paga-banco"
        : marks.has(key)
          ? "paga"
          : billInClosing(month, b?.dueDate, closing)
            ? "fechada"
            : b?.status === "parcial"
              ? "parcial"
              : "pendente";
    const row: CardBillRow = { card, key, total, bankPaid: b?.paid ?? 0, dueDate: b?.dueDate, status, fromBank: Boolean(b) };
    const o = out[card.owner];
    o.rows.push(row);
    o.total += total;
    if (!isSettledStatus(status)) {
      o.pendingCount++;
      o.pending += Math.max(0, total - (status === "parcial" ? row.bankPaid : 0));
    }
  }
  for (const o of Object.values(out)) {
    o.rows.sort((a, b) => Number(isSettledStatus(a.status)) - Number(isSettledStatus(b.status)) || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9") || b.total - a.total);
  }
  return out;
}

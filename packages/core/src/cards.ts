import type { Allocation, Cents, Expense, PersonId } from "./types";

/**
 * Modelo normalizado de cartão/fatura, independente do agregador
 * (Pluggy, Belvo...). O backend converte a resposta do provedor para cá.
 */
export interface CreditCard {
  id: string;
  ownerId: PersonId;
  institution: string;
  /** Ex.: "Mastercard Black final 1234". Nunca guardamos o número completo. */
  displayName: string;
  last4?: string;
}

export interface CardTransaction {
  id: string;
  cardId: string;
  date: string; // ISO 8601
  description: string;
  amount: Cents; // positivo = compra, negativo = estorno
  category?: string;
  installment?: { number: number; total: number };
}

export interface CardBill {
  id: string;
  cardId: string;
  /** Mês de referência no formato AAAA-MM. */
  referenceMonth: string;
  dueDate: string; // ISO 8601
  total: Cents;
  minimumPayment?: Cents;
  transactions: CardTransaction[];
}

/** Classificação que o casal faz em cada transação (guardada no nosso banco). */
export type TransactionClassification = Record<string, Allocation>;

/**
 * Converte as transações das faturas em despesas para o fechamento.
 * O que não foi classificado entra com `fallback` (por padrão: pessoal de quem pagou).
 */
export function billsToExpenses(
  bills: CardBill[],
  cards: CreditCard[],
  classification: TransactionClassification,
  fallback: "personal" | "shared" = "personal",
): Expense[] {
  const ownerByCard = new Map(cards.map((c) => [c.id, c.ownerId]));
  const out: Expense[] = [];
  for (const bill of bills) {
    const owner = ownerByCard.get(bill.cardId);
    if (!owner) throw new Error(`Cartão sem dono: ${bill.cardId}`);
    for (const t of bill.transactions) {
      const allocation: Allocation =
        classification[t.id] ??
        (fallback === "shared" ? { type: "shared" } : { type: "personal", ownerId: owner });
      out.push({
        id: `tx:${t.id}`,
        description: t.description,
        amount: t.amount,
        paidBy: owner,
        allocation,
        source: "card_transaction",
      });
    }
  }
  return out;
}

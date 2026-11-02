import type { CardBill, CreditCard } from "@corujinha/core";
import type { FinanceProvider } from "./types.js";

/** Dados fictícios para desenvolver sem conta em agregador nem banco real. */
export class MockProvider implements FinanceProvider {
  readonly name = "mock";
  readonly revoked = new Set<string>();

  async createConnectToken() {
    return { accessToken: "mock-connect-token" };
  }

  async fetchCardsAndBills({ itemId, ownerId }: { itemId: string; ownerId: string }) {
    const cardId = `${itemId}-card`;
    const cards: CreditCard[] = [
      { id: cardId, ownerId, institution: "Banco Fictício", displayName: "Cartão final 4242", last4: "4242" },
    ];
    const bills: CardBill[] = [
      {
        id: `${itemId}-bill-2026-10`,
        cardId,
        referenceMonth: "2026-10",
        dueDate: "2026-11-10",
        total: 48_790,
        transactions: [
          { id: `${itemId}-t1`, cardId, date: "2026-10-02", description: "Supermercado", amount: 32_450, category: "Mercado" },
          { id: `${itemId}-t2`, cardId, date: "2026-10-09", description: "Streaming", amount: 5_590, category: "Assinaturas" },
          {
            id: `${itemId}-t3`,
            cardId,
            date: "2026-10-15",
            description: "Geladeira 3/10",
            amount: 12_000,
            category: "Casa",
            installment: { number: 3, total: 10 },
          },
          { id: `${itemId}-t4`, cardId, date: "2026-10-20", description: "Estorno farmácia", amount: -1_250, category: "Saúde" },
        ],
      },
    ];
    return { cards, bills };
  }

  async revokeConnection(itemId: string) {
    this.revoked.add(itemId);
  }
}

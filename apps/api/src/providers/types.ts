import type { CardBill, CreditCard } from "@corujinha/core";

/**
 * Contrato que qualquer agregador de Open Finance precisa cumprir.
 * Só existem operações de LEITURA de cartão/fatura e de revogação.
 * Não há (e não deve haver) nada de Pix, pagamento ou saldo de conta.
 */
export interface FinanceProvider {
  readonly name: string;
  /** Token de curta duração para abrir o widget de conexão no app. */
  createConnectToken(input: { userId: string; itemId?: string }): Promise<{ accessToken: string }>;
  /** Baixa cartões e faturas (com transações) de uma conexão. */
  fetchCardsAndBills(input: {
    itemId: string;
    ownerId: string;
    since: string; // AAAA-MM-DD
  }): Promise<{ cards: CreditCard[]; bills: CardBill[] }>;
  /** Apaga a conexão no agregador, o que revoga o consentimento no banco. */
  revokeConnection(itemId: string): Promise<void>;
}

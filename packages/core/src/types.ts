/**
 * Tipos de domínio do Corujinha.
 *
 * Todos os valores monetários são inteiros em centavos (BRL) para evitar
 * erros de ponto flutuante. Ex.: R$ 12,34 => 1234.
 */

export type Cents = number;
export type PersonId = string;

export interface Person {
  id: PersonId;
  name: string;
  /** Remuneração mensal líquida, em centavos. Usada na divisão proporcional. */
  monthlyIncome?: Cents;
}

/** Como uma despesa compartilhada é dividida entre as pessoas do grupo. */
export type SplitRule =
  | { kind: "equal" }
  | { kind: "proportional_income" }
  /** Percentuais fixos em pontos-base (10000 = 100%). Ex.: { a: 6000, b: 4000 }. */
  | { kind: "custom"; sharesBps: Record<PersonId, number> };

/**
 * Destino de uma despesa:
 * - `shared`: entra na divisão do casal, conforme a regra (a do grupo ou uma específica).
 * - `personal`: é só de uma pessoa (pode ter sido paga por outra, ex.: no cartão dela).
 */
export type Allocation =
  | { type: "shared"; rule?: SplitRule }
  | { type: "personal"; ownerId: PersonId };

/** Uma linha que entra no fechamento do mês: transação de fatura ou conta recorrente. */
export interface Expense {
  id: string;
  description: string;
  /** Positivo = gasto; negativo = estorno/crédito. */
  amount: Cents;
  /** Quem efetivamente pagou (dono do cartão ou de quem saiu o dinheiro). */
  paidBy: PersonId;
  allocation: Allocation;
  source: "card_transaction" | "recurring_bill" | "manual";
}

/** Conta recorrente cadastrada pelo casal (aluguel, condomínio, internet...). */
export interface RecurringBill {
  id: string;
  description: string;
  amount: Cents;
  paidBy: PersonId;
  allocation: Allocation;
  /** Dia do vencimento (1-31). */
  dueDay: number;
  active: boolean;
}

export interface PersonBalance {
  personId: PersonId;
  /** Quanto essa pessoa pagou de fato no mês. */
  paid: Cents;
  /** Quanto essa pessoa deveria arcar (parte justa). */
  owes: Cents;
  /** paid - owes. Positivo = tem a receber; negativo = tem a pagar. */
  balance: Cents;
}

export interface Transfer {
  from: PersonId;
  to: PersonId;
  amount: Cents;
}

export interface MonthlySettlement {
  total: Cents;
  sharedTotal: Cents;
  personalTotal: Cents;
  balances: PersonBalance[];
  /** Transferências mínimas para zerar os saldos. */
  transfers: Transfer[];
}

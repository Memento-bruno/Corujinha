/**
 * Modelos de domínio do Corujinha.
 *
 * Regras gerais:
 * - Todo valor monetário é um inteiro em CENTAVOS (BRL). R$ 12,34 => 1234.
 *   Positivo = gasto; negativo = estorno/crédito.
 * - Meses são strings "YYYY-MM".
 * - O app é somente leitura em relação ao dinheiro: nada aqui inicia pagamento.
 */

export type Cents = number;
export type MonthKey = string; // "YYYY-MM"
export type UserId = "USER_A" | "USER_B";

export const USERS: readonly UserId[] = ["USER_A", "USER_B"] as const;

export function otherUser(u: UserId): UserId {
  return u === "USER_A" ? "USER_B" : "USER_A";
}

export type SplitType = "SHARED_DEFAULT" | "SHARED_CUSTOM" | "INDIVIDUAL_A" | "INDIVIDUAL_B";

export interface Split {
  type: SplitType;
  /** Só para SHARED_CUSTOM: percentual (0-100) que cabe ao USER_A. O resto é do USER_B. */
  percentA?: number;
}

export type CategoryId =
  | "mercado"
  | "restaurantes"
  | "delivery"
  | "lanches"
  | "transporte_app"
  | "combustivel"
  | "moradia"
  | "saude"
  | "farmacia"
  | "educacao"
  | "assinaturas"
  | "lazer"
  | "compras"
  | "viagem"
  | "pets"
  | "servicos"
  | "outros";

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  /** Setores essenciais não recebem alerta de "estouro de média móvel". */
  essential: boolean;
  /** Gastos variáveis de alta frequência (candidatos a "formiguinha"). */
  highFrequency: boolean;
  color: string;
}

export interface UserProfile {
  id: UserId;
  name: string;
  /** E-mail Google autorizado (preenchido a partir do .env no servidor; nunca exibido para terceiros). */
  email?: string;
  avatarColor: string;
}

export type CardBrand = "visa" | "mastercard" | "elo" | "amex" | "hipercard" | "outra";

export interface CreditCard {
  id: string;
  owner: UserId;
  nickname: string;
  /** Somente os 4 últimos dígitos. Nunca guardamos o número completo. */
  last4: string;
  brand: CardBrand;
  /** Índice do gradiente visual (0-3). */
  theme: number;
}

export interface HouseholdConfig {
  schemaVersion: 1;
  users: Record<UserId, UserProfile>;
  cards: CreditCard[];
  /** Divisão padrão do casal: percentual que cabe ao USER_A (0-100). 50 = meio a meio. */
  defaultSplitPercentA: number;
  /** Meta mensal de gastos do casal (centavos). Base do medidor de saúde. */
  monthlyGoal: Cents;
  /** Tetos de gasto por setor (centavos). */
  sectorBudgets: Partial<Record<CategoryId, Cents>>;
  savingsRules: SavingsRulesConfig;
  /** Estabelecimentos marcados pelo casal como assinatura (merchantKey). */
  subscriptionMerchants: string[];
  /** Conexões Open Finance (Meu Pluggy). O itemId sozinho não dá acesso a nada sem o client secret. */
  pluggyItems?: PluggyItemLink[];
  pluggyLastSyncAt?: string;
  updatedAt: string;
}

export interface PluggyItemLink {
  itemId: string;
  /** De quem são os cartões dessa conexão. */
  owner: UserId;
}

export interface SavingsRulesConfig {
  /** Percentual acima da média de 3 meses que dispara o alerta (ex.: 15). */
  movingAverageThresholdPct: number;
  /** Número mínimo de ocorrências no mês para "gasto formiguinha". */
  highFrequencyMinOccurrences: number;
}

export interface Installment {
  current: number;
  total: number;
}

export type TransactionSource = "demo" | "csv" | "ofx" | "pdf" | "pluggy" | "manual";

export interface Transaction {
  id: string;
  /** Data da compra (ISO "YYYY-MM-DD"). */
  date: string;
  description: string;
  /** Nome normalizado do estabelecimento, usado para agrupar (ex.: "netflix"). */
  merchantKey: string;
  amount: Cents;
  cardId: string;
  /** Dono da fatura (quem paga o cartão). */
  paidBy: UserId;
  category: CategoryId;
  tags: string[];
  split: Split;
  installment?: Installment;
  source: TransactionSource;
  /** Id da transação no provedor (ex.: Pluggy), para não importar duas vezes. */
  externalId?: string;
  /** Conexão Open Finance de onde a compra veio (para apagar ao desconectar). */
  pluggyItemId?: string;
}

export type RecurringKind = "CONTA_FIXA" | "FINANCIAMENTO" | "PARCELAMENTO" | "ASSINATURA";

/**
 * Dívida/conta recorrente paga FORA das faturas de cartão (boleto, débito, transferência).
 * Se a cobrança cai num cartão, ela já aparece como transação e não deve ser cadastrada aqui.
 */
export interface RecurringDebt {
  id: string;
  description: string;
  kind: RecurringKind;
  amount: Cents;
  paidBy: UserId;
  split: Split;
  category: CategoryId;
  dueDay: number;
  /** Primeiro mês em que a dívida vale. */
  startMonth: MonthKey;
  /** Para financiamentos/parcelamentos: número total de parcelas. */
  totalInstallments?: number;
  active: boolean;
}

export interface RecurringDebtsFile {
  schemaVersion: 1;
  debts: RecurringDebt[];
  updatedAt: string;
}

export interface MonthSnapshot {
  closedAt: string;
  closedBy: UserId;
  settlement: SettlementResult;
  totalStatements: Cents;
  totalRecurring: Cents;
}

export interface StatementFile {
  schemaVersion: 1;
  month: MonthKey;
  transactions: Transaction[];
  snapshot?: MonthSnapshot;
  /** Fatura informada pelo banco (Open Finance), por cartão principal: total, quanto foi pago e situação. */
  bankBills?: Record<string, BankBill>;
  updatedAt: string;
}

export interface BankBill {
  total: Cents;
  paid: Cents;
  status: "paga" | "parcial" | "em aberto";
}

/** Linha que entra no encontro de contas: transação de cartão ou dívida recorrente. */
export interface Expense {
  id: string;
  description: string;
  amount: Cents;
  paidBy: UserId;
  split: Split;
  origin: "CARD" | "RECURRING";
}

export interface ShareResult {
  shareA: Cents;
  shareB: Cents;
}

export interface CreditBreakdown {
  /** Fração do outro nas compras conjuntas (cartão) pagas por esta pessoa. */
  sharedCard: Cents;
  /** Compras 100% do outro que caíram no cartão desta pessoa. */
  individualOnMyCard: Cents;
  /** Fração do outro nas dívidas recorrentes pagas por esta pessoa. */
  sharedRecurring: Cents;
  /** Recorrentes 100% do outro pagas por esta pessoa. */
  individualRecurring: Cents;
  total: Cents;
}

export interface SettlementResult {
  /** Soma de tudo (cartões + recorrentes). */
  grossTotal: Cents;
  paid: Record<UserId, Cents>;
  /** Quanto cada um deveria arcar (parte justa). */
  fairShare: Record<UserId, Cents>;
  /** Créditos que cada pessoa tem contra a outra, antes da compensação. */
  credits: Record<UserId, CreditBreakdown>;
  /** Valor abatido dos dois lados (o menor dos dois créditos). */
  crossOffset: Cents;
  /** Resultado final: quem paga quanto para quem (null = zerado). */
  transfer: { from: UserId; to: UserId; amount: Cents } | null;
}

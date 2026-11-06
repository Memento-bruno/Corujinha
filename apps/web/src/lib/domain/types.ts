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

/** Compra 100% de quem é o dono da fatura. É assim que toda compra de cartão chega. */
export function ownerSplit(owner: UserId): Split {
  return { type: owner === "USER_A" ? "INDIVIDUAL_A" : "INDIVIDUAL_B" };
}

export function isSharedSplit(s: Split | undefined): boolean {
  return s?.type === "SHARED_DEFAULT" || s?.type === "SHARED_CUSTOM";
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
  /** Quando a pessoa terminou (ou pulou) o primeiro acesso guiado. */
  onboardedAt?: string;
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
  /** Cartão virtual ou adicional: id do cartão principal da mesma fatura. */
  parentId?: string;
  /** Divisão das compras novas deste cartão (ex.: adicional que só um dos dois usa). Sem isso, a divisão padrão. */
  defaultSplit?: Split;
}

export interface HouseholdConfig {
  schemaVersion: 1;
  users: Record<UserId, UserProfile>;
  cards: CreditCard[];
  /** Divisão padrão do casal: percentual que cabe ao USER_A (0-100). 50 = meio a meio. */
  defaultSplitPercentA: number;
  /** Meta mensal de gastos do casal (centavos). Base do medidor de saúde. */
  monthlyGoal: Cents;
  /**
   * Salário líquido de cada um (centavos). Só serve para calcular quanto da renda os gastos usam:
   * a interface nunca mostra esses valores, só porcentagens.
   */
  incomes?: Partial<Record<UserId, Cents>>;
  /** Tetos de gasto por setor (centavos). */
  sectorBudgets: Partial<Record<CategoryId, Cents>>;
  savingsRules: SavingsRulesConfig;
  /** Estabelecimentos marcados pelo casal como assinatura (merchantKey). */
  subscriptionMerchants: string[];
  /**
   * Memória de fornecedores (por merchantKey): setor e divisão que o casal escolheu da última vez.
   * Compra nova do mesmo fornecedor já chega com eles.
   */
  merchantRules?: Record<string, MerchantRule>;
  /** Conexões Open Finance (Meu Pluggy). O itemId sozinho não dá acesso a nada sem o client secret. */
  pluggyItems?: PluggyItemLink[];
  pluggyLastSyncAt?: string;
  /** Faturas de cartão marcadas como pagas no app: "idDoCartão|YYYY-MM". Só uma marca, nenhum pagamento. */
  paidCardBills?: string[];
  /** Quem quer receber lembrete de vencimento por e-mail (padrão: sim, se o e-mail estiver configurado). */
  reminderEmails?: Partial<Record<UserId, boolean>>;
  /**
   * Quando as compras de cartão já salvas passaram a ser do dono da fatura (conversão feita uma vez só).
   * Sem isso, o servidor converte os meses abertos na próxima abertura do app.
   */
  ownerPaysCardsAt?: string;
  updatedAt: string;
}

export interface MerchantRule {
  /** Nome para mostrar (descrição da última compra editada). */
  name: string;
  category?: CategoryId;
  split?: Split;
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
  /** Compra nova que ainda ninguém conferiu (categoria e divisão). Some quando alguém confirma ou edita. */
  toReview?: boolean;
  /** Pergunta de um para o outro sobre a compra ("o que é isso?"). */
  question?: PurchaseQuestion;
  /** Só na tela (nunca salvo): compra recorrente prevista que o banco ainda não trouxe. Id da recorrente. */
  predictedFrom?: string;
}

export interface PurchaseQuestion {
  by: UserId;
  text: string;
  at: string;
  answer?: string;
  answeredBy?: UserId;
  answeredAt?: string;
}

export type RecurringKind = "BOLETO" | "CONTA_FIXA" | "FINANCIAMENTO" | "PARCELAMENTO" | "ASSINATURA" | "CARTAO";

/**
 * Conta recorrente (ou avulsa) do casal.
 * - Tipos fora do cartão (boleto, débito, transferência) entram direto no encontro de contas.
 * - "CARTAO": compra que se repete todo mês num cartão. Enquanto o banco ainda não trouxe a
 *   compra do mês, ela aparece como "prevista" na fatura daquele cartão. Quando a compra real
 *   chega (mesmo cartão + mesmo estabelecimento), a prevista some.
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
  /** Para financiamentos/parcelamentos: número total de parcelas. 1 = conta avulsa (só um mês). */
  totalInstallments?: number;
  active: boolean;
  /** Só para "CARTAO": cartão e estabelecimento da compra que se repete. */
  cardId?: string;
  merchantKey?: string;
  /** Meses em que a conta foi marcada como paga no app ("Já paguei"). Só uma marca, nenhum pagamento. */
  paidMonths?: MonthKey[];
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
  /** Vencimento da fatura informado pelo banco ("YYYY-MM-DD"). */
  dueDate?: string;
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

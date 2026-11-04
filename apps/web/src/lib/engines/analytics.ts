/**
 * Cálculos de painel: totais por setor, variação mensal, assinaturas,
 * projeção de parcelas futuras e o score de saúde da fatura.
 * Tudo determinístico e sem rede.
 */
import { CATEGORIES } from "../domain/categories";
import { addMonths, monthRange } from "../domain/months";
import type {
  Cents,
  CategoryId,
  HouseholdConfig,
  MonthKey,
  Transaction,
  UserId,
} from "../domain/types";

export const SUBSCRIPTION_TAG = "Assinatura";

export type ViewFilter = "COUPLE" | UserId;

export function filterByView(txs: Transaction[], view: ViewFilter): Transaction[] {
  return view === "COUPLE" ? txs : txs.filter((t) => t.paidBy === view);
}

export function sumCents(txs: { amount: Cents }[]): Cents {
  return txs.reduce((s, t) => s + t.amount, 0);
}

/** Variação percentual entre dois valores (null se não há base de comparação). */
export function deltaPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export interface SectorTotal {
  category: CategoryId;
  amount: Cents;
  count: number;
  budget?: Cents;
}

export function sectorTotals(txs: Transaction[], config?: HouseholdConfig): SectorTotal[] {
  const map = new Map<CategoryId, SectorTotal>();
  for (const t of txs) {
    const cur = map.get(t.category) ?? { category: t.category, amount: 0, count: 0 };
    cur.amount += t.amount;
    cur.count += 1;
    map.set(t.category, cur);
  }
  const out = [...map.values()].filter((s) => s.amount > 0);
  if (config) for (const s of out) s.budget = config.sectorBudgets[s.category];
  return out.sort((a, b) => b.amount - a.amount);
}

// ---------------------------------------------------------------------------
// Assinaturas
// ---------------------------------------------------------------------------

export function isSubscription(t: Transaction, config?: Pick<HouseholdConfig, "subscriptionMerchants">): boolean {
  return (
    t.tags.includes(SUBSCRIPTION_TAG) ||
    t.category === "assinaturas" ||
    (config?.subscriptionMerchants.includes(t.merchantKey) ?? false)
  );
}

/**
 * Regra de repetição mensal: um estabelecimento que aparece em pelo menos
 * `minMonths` meses seguidos (terminando no mês atual), uma única vez por mês e
 * com valor fixo (±3%, aceitando um reajuste de até 25% no mês atual), é sugerido como assinatura.
 */
export function detectRecurringMerchants(
  byMonth: Record<MonthKey, Transaction[]>,
  month: MonthKey,
  minMonths = 3,
): string[] {
  const months = monthRange(month, minMonths);
  const perMonth = months.map((m) => {
    const groups = new Map<string, Transaction[]>();
    for (const t of byMonth[m] ?? []) {
      if (t.installment || t.amount <= 0) continue;
      const list = groups.get(t.merchantKey) ?? [];
      list.push(t);
      groups.set(t.merchantKey, list);
    }
    return groups;
  });
  const candidates = [...(perMonth[perMonth.length - 1]?.keys() ?? [])];
  return candidates.filter((key) => {
    const amounts: number[] = [];
    for (const g of perMonth) {
      const list = g.get(key);
      if (!list || list.length !== 1) return false;
      amounts.push(list[0].amount);
    }
    // Assinatura tem preço fixo: os meses anteriores precisam ter o mesmo valor (±3%)
    // e o mês atual pode ter um reajuste de até 25%.
    const earlier = amounts.slice(0, -1);
    const min = Math.min(...earlier);
    const max = Math.max(...earlier);
    const last = amounts[amounts.length - 1];
    return min > 0 && max <= min * 1.03 && last >= min * 0.97 && last <= max * 1.25;
  });
}

// ---------------------------------------------------------------------------
// Parcelas futuras
// ---------------------------------------------------------------------------

export interface InstallmentProjection {
  month: MonthKey;
  USER_A: Cents;
  USER_B: Cents;
  total: Cents;
  items: { description: string; amount: Cents; label: string; paidBy: UserId }[];
}

/**
 * Projeta as parcelas já contratadas (ex.: "03/10") para os próximos meses.
 * Uma compra na parcela 3 de 10 gera mais 7 parcelas a partir do mês seguinte.
 */
export function projectInstallments(
  currentMonthTxs: Transaction[],
  month: MonthKey,
  horizon = 12,
): InstallmentProjection[] {
  const out: InstallmentProjection[] = Array.from({ length: horizon }, (_, i) => ({
    month: addMonths(month, i + 1),
    USER_A: 0,
    USER_B: 0,
    total: 0,
    items: [],
  }));
  for (const t of currentMonthTxs) {
    if (!t.installment) continue;
    const remaining = t.installment.total - t.installment.current;
    for (let k = 1; k <= Math.min(remaining, horizon); k++) {
      const slot = out[k - 1];
      slot[t.paidBy] += t.amount;
      slot.total += t.amount;
      const n = t.installment.current + k;
      slot.items.push({
        description: t.description,
        amount: t.amount,
        paidBy: t.paidBy,
        label: `${String(n).padStart(2, "0")}/${String(t.installment.total).padStart(2, "0")}`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Saúde da fatura (0-100)
// ---------------------------------------------------------------------------

export interface HealthScore {
  score: number;
  label: "Excelente" | "Boa" | "Atenção" | "Crítica";
  ratioToGoal: number;
  overBudgetSectors: CategoryId[];
}

/**
 * Score determinístico:
 * - Até 80% da meta: 100 pontos.
 * - De 80% a 100% da meta: cai linearmente de 100 para 75.
 * - De 100% a 150% da meta: cai linearmente de 75 para 0.
 * - Menos 5 pontos por setor acima do teto (máximo −25).
 */
export function healthScore(totalSpent: Cents, goal: Cents, sectors: SectorTotal[]): HealthScore {
  const ratio = goal > 0 ? totalSpent / goal : 0;
  let base: number;
  if (ratio <= 0.8) base = 100;
  else if (ratio <= 1) base = 100 - ((ratio - 0.8) / 0.2) * 25;
  else if (ratio <= 1.5) base = 75 - ((ratio - 1) / 0.5) * 75;
  else base = 0;
  const over = sectors.filter((s) => s.budget && s.amount > s.budget).map((s) => s.category);
  const score = Math.max(0, Math.min(100, Math.round(base - Math.min(25, over.length * 5))));
  const label = score >= 85 ? "Excelente" : score >= 65 ? "Boa" : score >= 40 ? "Atenção" : "Crítica";
  return { score, label, ratioToGoal: ratio, overBudgetSectors: over };
}

export function categoryLabel(c: CategoryId): string {
  return CATEGORIES[c]?.label ?? c;
}

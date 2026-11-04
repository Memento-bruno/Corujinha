/**
 * RuleBasedSavingsEngine — motor puramente matemático de sugestão de cortes.
 *
 * NÃO usa IA nem serviços externos. Cada recomendação vem de uma regra objetiva
 * e reproduzível sobre as faturas do casal:
 *
 *  1. DUPLICATE_SUBSCRIPTION  Mesma assinatura nos cartões de A e de B, ou várias
 *                             assinaturas da mesma subcategoria (ex.: 3 streamings de vídeo).
 *  2. SUBSCRIPTION_INFLATION  Assinatura mais cara do que no mês anterior em que apareceu.
 *  3. SECTOR_OVERRUN          Setor não essencial > média dos últimos 3 meses + X% (padrão 15%)
 *                             ou acima do teto definido pelo casal.
 *  4. HIGH_FREQUENCY          "Gastos formiguinha": estabelecimento/categoria variável com
 *                             mais de N ocorrências no mês; mostra cortes de 30% e 50%.
 *  5. Simulador               `simulatorCandidates` lista assinaturas e gastos variáveis
 *                             para o casal marcar e ver a economia em tempo real.
 *
 * As mensagens NÃO trazem valores em texto: a interface monta o texto com o
 * formatador ativo (R$ ou %), para respeitar o Modo Privacidade.
 */
import { CATEGORIES } from "../domain/categories";
import { monthRange, addMonths } from "../domain/months";
import type { Cents, CategoryId, HouseholdConfig, MonthKey, Transaction, UserId } from "../domain/types";
import { isSubscription, sumCents } from "./analytics";

export type SavingsRule =
  | "DUPLICATE_SUBSCRIPTION"
  | "SUBSCRIPTION_INFLATION"
  | "SECTOR_OVERRUN"
  | "HIGH_FREQUENCY";

export type Severity = "high" | "medium" | "low";

export interface SavingsRecommendation {
  id: string;
  rule: SavingsRule;
  severity: Severity;
  title: string;
  /** Economia mensal estimada se a sugestão for seguida. */
  monthlySavings: Cents;
  /** Dados estruturados para a interface montar o texto. */
  details:
    | { kind: "duplicate"; merchants: { name: string; paidBy: UserId; amount: Cents }[]; group: string }
    | { kind: "inflation"; merchant: string; previous: Cents; current: Cents; previousMonth: MonthKey }
    | {
        kind: "overrun";
        category: CategoryId;
        current: Cents;
        average3m: Cents;
        budget?: Cents;
        overAveragePct: number | null;
        overBudget: boolean;
      }
    | {
        kind: "frequency";
        label: string;
        occurrences: number;
        total: Cents;
        cut30: Cents;
        cut50: Cents;
      };
}

export interface SimulatorCandidate {
  id: string;
  label: string;
  kind: "subscription" | "variable";
  category: CategoryId;
  paidBy: UserId | "BOTH";
  monthlyAmount: Cents;
  occurrences: number;
}

/** Subcategorias de assinatura para detectar "várias do mesmo tipo". */
export const SUBSCRIPTION_GROUPS: Record<string, string[]> = {
  "Streaming de vídeo": ["netflix", "prime video", "amazon prime", "disney", "max", "hbo", "globoplay", "paramount", "apple tv", "star+"],
  "Streaming de música": ["spotify", "deezer", "apple music", "youtube music", "tidal", "amazon music"],
  "Armazenamento em nuvem": ["icloud", "google one", "dropbox", "onedrive"],
  "Delivery por assinatura": ["ifood club", "rappi prime", "uber one"],
  "Academia": ["smart fit", "gympass", "wellhub", "bodytech", "totalpass"],
};

export function subscriptionGroupOf(merchantKey: string): string | null {
  for (const [group, keys] of Object.entries(SUBSCRIPTION_GROUPS)) {
    if (keys.some((k) => merchantKey.includes(k))) return group;
  }
  return null;
}

export interface SavingsInput {
  month: MonthKey;
  /** Transações por mês. Precisa conter o mês atual e, idealmente, os 3 anteriores. */
  byMonth: Record<MonthKey, Transaction[]>;
  config: HouseholdConfig;
}

export class RuleBasedSavingsEngine {
  constructor(private readonly input: SavingsInput) {}

  private get current(): Transaction[] {
    return this.input.byMonth[this.input.month] ?? [];
  }

  private subs(txs: Transaction[]): Transaction[] {
    return txs.filter((t) => t.amount > 0 && isSubscription(t, this.input.config));
  }

  analyze(): SavingsRecommendation[] {
    const recs = [
      ...this.duplicateSubscriptions(),
      ...this.subscriptionInflation(),
      ...this.sectorOverruns(),
      ...this.highFrequency(),
    ];
    const weight: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
    return recs.sort((a, b) => weight[a.severity] - weight[b.severity] || b.monthlySavings - a.monthlySavings);
  }

  /** Regra 1 */
  duplicateSubscriptions(): SavingsRecommendation[] {
    const subs = this.subs(this.current);
    const out: SavingsRecommendation[] = [];
    const usedIds = new Set<string>();

    // 1a. Mesmo serviço nos dois cartões
    const byMerchant = new Map<string, Transaction[]>();
    for (const t of subs) byMerchant.set(t.merchantKey, [...(byMerchant.get(t.merchantKey) ?? []), t]);
    for (const [key, list] of byMerchant) {
      const owners = new Set(list.map((t) => t.paidBy));
      if (owners.size < 2) continue;
      const sorted = [...list].sort((a, b) => a.amount - b.amount);
      list.forEach((t) => usedIds.add(t.id));
      out.push({
        id: `dup-merchant-${key}`,
        rule: "DUPLICATE_SUBSCRIPTION",
        severity: "high",
        title: `${list[0].description} cobrado nos dois cartões`,
        // Mantém a mais cara (ou um plano família) e corta as demais
        monthlySavings: sumCents(sorted.slice(0, -1)),
        details: {
          kind: "duplicate",
          group: list[0].description,
          merchants: list.map((t) => ({ name: t.description, paidBy: t.paidBy, amount: t.amount })),
        },
      });
    }

    // 1b. Várias assinaturas da mesma subcategoria
    const byGroup = new Map<string, Transaction[]>();
    for (const t of subs) {
      if (usedIds.has(t.id)) continue;
      const g = subscriptionGroupOf(t.merchantKey);
      if (!g) continue;
      byGroup.set(g, [...(byGroup.get(g) ?? []), t]);
    }
    for (const [group, list] of byGroup) {
      const distinct = new Set(list.map((t) => t.merchantKey));
      if (distinct.size < 2) continue;
      const sorted = [...list].sort((a, b) => a.amount - b.amount);
      out.push({
        id: `dup-group-${group}`,
        rule: "DUPLICATE_SUBSCRIPTION",
        severity: distinct.size >= 3 ? "high" : "medium",
        title: `${distinct.size} assinaturas de ${group.toLowerCase()}`,
        // Sugestão: manter só a mais cara (provavelmente a mais usada) e cortar as outras
        monthlySavings: sumCents(sorted.slice(0, -1)),
        details: {
          kind: "duplicate",
          group,
          merchants: list.map((t) => ({ name: t.description, paidBy: t.paidBy, amount: t.amount })),
        },
      });
    }
    return out;
  }

  /** Regra 2 */
  subscriptionInflation(): SavingsRecommendation[] {
    const out: SavingsRecommendation[] = [];
    const seen = new Set<string>();
    for (const t of this.subs(this.current)) {
      const key = `${t.merchantKey}|${t.paidBy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Procura o último mês anterior em que a mesma assinatura apareceu (até 6 meses atrás)
      for (let back = 1; back <= 6; back++) {
        const m = addMonths(this.input.month, -back);
        const prev = (this.input.byMonth[m] ?? []).find(
          (p) => p.merchantKey === t.merchantKey && p.paidBy === t.paidBy && p.amount > 0,
        );
        if (!prev) continue;
        if (t.amount > prev.amount) {
          const pct = ((t.amount - prev.amount) / prev.amount) * 100;
          out.push({
            id: `infl-${key}`,
            rule: "SUBSCRIPTION_INFLATION",
            severity: pct >= 15 ? "high" : "medium",
            title: `${t.description} ficou mais cara`,
            monthlySavings: t.amount - prev.amount,
            details: {
              kind: "inflation",
              merchant: t.description,
              previous: prev.amount,
              current: t.amount,
              previousMonth: m,
            },
          });
        }
        break;
      }
    }
    return out;
  }

  /** Regra 3 */
  sectorOverruns(): SavingsRecommendation[] {
    const { month, byMonth, config } = this.input;
    const threshold = config.savingsRules.movingAverageThresholdPct / 100;
    const prevMonths = monthRange(addMonths(month, -1), 3);
    // Parcelas já contratadas não entram: não dá para cortá-las no mês
    const totals = (txs: Transaction[]) => {
      const m = new Map<CategoryId, number>();
      for (const t of txs) if (!t.installment) m.set(t.category, (m.get(t.category) ?? 0) + t.amount);
      return m;
    };
    const cur = totals(this.current);
    const prevTotals = prevMonths.map((m) => totals(byMonth[m] ?? []));
    const monthsWithData = prevMonths.filter((m) => (byMonth[m] ?? []).length > 0).length;

    const out: SavingsRecommendation[] = [];
    for (const [category, current] of cur) {
      const meta = CATEGORIES[category];
      if (!meta || meta.essential || current <= 0) continue;
      const average =
        monthsWithData > 0
          ? Math.round(prevTotals.reduce((s, m) => s + (m.get(category) ?? 0), 0) / monthsWithData)
          : 0;
      const budget = config.sectorBudgets[category];
      const overAverage = average > 0 && current > average * (1 + threshold);
      const overBudget = budget !== undefined && budget > 0 && current > budget;
      if (!overAverage && !overBudget) continue;
      const overAveragePct = average > 0 ? ((current - average) / average) * 100 : null;
      // Economia: voltar ao menor entre a média e o teto
      const target = Math.min(average > 0 ? average : Infinity, overBudget ? budget! : Infinity);
      out.push({
        id: `overrun-${category}`,
        rule: "SECTOR_OVERRUN",
        severity: overBudget && overAverage ? "high" : "medium",
        title: `${meta.label} acima do normal`,
        monthlySavings: Number.isFinite(target) ? Math.max(0, current - target) : 0,
        details: { kind: "overrun", category, current, average3m: average, budget, overAveragePct, overBudget },
      });
    }
    return out;
  }

  /** Regra 4 */
  highFrequency(): SavingsRecommendation[] {
    const minOcc = this.input.config.savingsRules.highFrequencyMinOccurrences;
    const out: SavingsRecommendation[] = [];
    const variable = this.current.filter(
      (t) => t.amount > 0 && CATEGORIES[t.category]?.highFrequency && !t.installment,
    );
    const coveredCategories = new Set<CategoryId>();

    // Por estabelecimento
    const byMerchant = new Map<string, Transaction[]>();
    for (const t of variable) byMerchant.set(t.merchantKey, [...(byMerchant.get(t.merchantKey) ?? []), t]);
    for (const [key, list] of byMerchant) {
      if (list.length < minOcc) continue;
      coveredCategories.add(list[0].category);
      out.push(this.frequencyRec(`freq-m-${key}`, list[0].description, list));
    }
    // Por categoria (quando nenhum estabelecimento isolado bateu o limite)
    const byCategory = new Map<CategoryId, Transaction[]>();
    for (const t of variable) byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
    for (const [cat, list] of byCategory) {
      if (coveredCategories.has(cat) || list.length < minOcc) continue;
      out.push(this.frequencyRec(`freq-c-${cat}`, CATEGORIES[cat].label, list));
    }
    return out;
  }

  private frequencyRec(id: string, label: string, list: Transaction[]): SavingsRecommendation {
    const total = sumCents(list);
    return {
      id,
      rule: "HIGH_FREQUENCY",
      severity: list.length >= 15 ? "high" : "low",
      title: `${list.length}× ${label} no mês`,
      monthlySavings: Math.round(total * 0.3),
      details: {
        kind: "frequency",
        label,
        occurrences: list.length,
        total,
        cut30: Math.round(total * 0.3),
        cut50: Math.round(total * 0.5),
      },
    };
  }

  /** Regra 5: itens para o simulador "E se cortarmos?" */
  simulatorCandidates(): SimulatorCandidate[] {
    const out: SimulatorCandidate[] = [];
    const groups = new Map<string, Transaction[]>();
    for (const t of this.current) {
      if (t.amount <= 0 || t.installment) continue;
      const sub = isSubscription(t, this.input.config);
      const variable = !CATEGORIES[t.category]?.essential;
      if (!sub && !variable) continue;
      const key = `${sub ? "s" : "v"}|${t.merchantKey}`;
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    for (const [key, list] of groups) {
      const owners = new Set(list.map((t) => t.paidBy));
      out.push({
        id: key,
        label: list[0].description,
        kind: key.startsWith("s|") ? "subscription" : "variable",
        category: list[0].category,
        paidBy: owners.size > 1 ? "BOTH" : list[0].paidBy,
        monthlyAmount: sumCents(list),
        occurrences: list.length,
      });
    }
    return out.sort((a, b) =>
      a.kind === b.kind ? b.monthlyAmount - a.monthlyAmount : a.kind === "subscription" ? -1 : 1,
    );
  }
}

/** Economia simulada: soma dos itens marcados e % sobre a fatura total. */
export function simulateCuts(
  candidates: SimulatorCandidate[],
  selected: Set<string>,
  invoiceTotal: Cents,
): { savings: Cents; pctOfInvoice: number; newTotal: Cents } {
  const savings = candidates.filter((c) => selected.has(c.id)).reduce((s, c) => s + c.monthlyAmount, 0);
  return {
    savings,
    pctOfInvoice: invoiceTotal > 0 ? (savings / invoiceTotal) * 100 : 0,
    newTotal: invoiceTotal - savings,
  };
}

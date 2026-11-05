"use client";

import { useMemo } from "react";
import { addMonths, monthRange } from "../domain/months";
import { formatBRL, formatPct, formatSci, pctOf } from "../domain/money";
import type { Cents, MonthKey, Transaction, UserId } from "../domain/types";
import {
  deltaPct,
  detectRecurringMerchants,
  filterByView,
  healthScore,
  isSubscription,
  projectInstallments,
  sectorTotals,
  sumCents,
} from "../engines/analytics";
import { RuleBasedSavingsEngine } from "../engines/savings";
import { withPredicted } from "../engines/recurring";
import { recurringToExpenses, settleMonth, splitAmount } from "../engines/settlement";
import {
  billsPaidRatio,
  cardTxsFor,
  financialHealth,
  incomeUsage,
  monthComposition,
  monthSpend,
} from "../engines/overview";
import { useStore } from "./store";

/**
 * Formatador único de valores. No Modo Privacidade NENHUM valor em R$ é exibido:
 * tudo vira percentual sobre uma base (por padrão, a fatura consolidada do mês).
 */
export interface Fmt {
  privacy: boolean;
  sci: boolean;
  money: (cents: Cents, base?: Cents, opts?: { compact?: boolean; signed?: boolean }) => string;
  pct: (value: number) => string;
  /** Rótulo de gráfico: só o número, sem "R$" nem "×10³" (ex.: "2.536" ou "2,54"). */
  num: (cents: Cents, base?: Cents) => string;
  baseLabel: string;
}

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function useFmt(defaultBase?: Cents): Fmt {
  const { privacy, sci } = useStore();
  const derived = useDerivedOptional();
  const base = defaultBase ?? derived?.total ?? 0;
  return useMemo(
    () => ({
      privacy,
      sci,
      baseLabel: "da fatura",
      pct: formatPct,
      num: (cents, b) => {
        if (privacy) return formatPct(pctOf(cents, b ?? base));
        const reais = cents / 100;
        return sci ? (reais / 1000).toFixed(2).replace(".", ",") : NUM.format(Math.round(reais));
      },
      money: (cents, b, opts) => {
        if (privacy) {
          const v = pctOf(cents, b ?? base);
          return `${opts?.signed && v > 0 ? "+" : ""}${formatPct(v)}`;
        }
        const s = sci ? formatSci(cents) : formatBRL(cents, opts?.compact);
        return opts?.signed && cents > 0 ? `+${s}` : s;
      },
    }),
    [privacy, sci, base],
  );
}

export function useDerived(): Derived {
  const d = useDerivedOptional();
  if (!d) throw new Error("useDerived usado antes de carregar o estado");
  return d;
}

function useDerivedOptional() {
  const { state, view } = useStore();
  return useMemo(() => {
    if (!state) return null;
    const { month, config, recurring, statements } = state;
    const cfg = config.data;
    const debts = recurring.data.debts;
    // Cada fatura já com as compras recorrentes de cartão previstas (as que o banco ainda não trouxe).
    // Mês fechado fica exatamente como foi fechado.
    const byMonth: Record<MonthKey, Transaction[]> = Object.fromEntries(
      Object.entries(statements).map(([m, s]) => [m, s.data.snapshot ? s.data.transactions : withPredicted(debts, m, s.data.transactions)]),
    );
    const allTxs = byMonth[month] ?? withPredicted(debts, month, []);
    const txs = filterByView(allTxs, view);
    const prevMonth = addMonths(month, -1);
    const prevTxs = filterByView(byMonth[prevMonth] ?? [], view);

    const coupleTotal = sumCents(allTxs);
    const total = sumCents(txs);
    const prevTotal = sumCents(prevTxs);

    const shareOf = (list: Transaction[]) => {
      let a = 0;
      let b = 0;
      for (const t of list) {
        const s = splitAmount(t.amount, t.split, cfg.defaultSplitPercentA);
        a += s.shareA;
        b += s.shareB;
      }
      return { USER_A: a, USER_B: b } as Record<UserId, Cents>;
    };
    const shares = shareOf(allTxs);
    const prevShares = shareOf(byMonth[prevMonth] ?? []);

    const settlement = settleMonth(month, allTxs, debts, cfg.defaultSplitPercentA);
    const prevSettlement = settleMonth(prevMonth, byMonth[prevMonth] ?? [], debts, cfg.defaultSplitPercentA);
    const recurringExpenses = recurringToExpenses(debts, month);

    const sectors = sectorTotals(txs, cfg);
    const health = healthScore(coupleTotal, cfg.monthlyGoal, sectorTotals(allTxs, cfg));

    const evolution = monthRange(month, 6).map((m) => {
      const list = byMonth[m] ?? [];
      return {
        month: m,
        total: sumCents(filterByView(list, view)),
        USER_A: sumCents(list.filter((t) => t.paidBy === "USER_A")),
        USER_B: sumCents(list.filter((t) => t.paidBy === "USER_B")),
      };
    });

    const installments = projectInstallments(txs, month, 12);

    // --- Tela Início: cartão + contas fora do cartão, histórico e previsão ---
    const openMonth = state.openMonth ?? month;
    const cardOf = (m: MonthKey) => cardTxsFor(byMonth, debts, m, openMonth);
    const coupleSpendOf = (m: MonthKey) => monthSpend(cardOf(m), debts, m, openMonth, cfg.monthlyGoal);
    // Filtro de pessoa (topo): só o que passa no cartão ou nas contas de quem foi escolhido.
    // A meta de uma pessoa é a parte dela na divisão padrão.
    const viewDebts = view === "COUPLE" ? debts : debts.filter((x) => x.paidBy === view);
    const goal =
      view === "COUPLE"
        ? cfg.monthlyGoal
        : Math.round((cfg.monthlyGoal * (view === "USER_A" ? cfg.defaultSplitPercentA : 100 - cfg.defaultSplitPercentA)) / 100);
    const viewCardOf = (m: MonthKey) => filterByView(cardOf(m), view);
    const spendOf = (m: MonthKey) => monthSpend(viewCardOf(m), viewDebts, m, openMonth, goal);
    const spend = spendOf(month);
    /** Faixa de meses do topo: fixa em volta da fatura em aberto (sempre do casal). */
    const strip = monthRange(addMonths(openMonth, 5), 12).map(coupleSpendOf);
    /** Linha de evolução: 4 meses antes, o mês e 4 depois. */
    const timeline = monthRange(addMonths(month, 4), 9).map(spendOf);
    const composition = timeline.map((s) => ({ ...s, parts: monthComposition(viewCardOf(s.month), viewDebts, s.month) }));
    const income = incomeUsage(settlement.grossTotal, settlement.fairShare, cfg.incomes);
    const healthOf = (m: MonthKey, sp: number, futureInst: number) =>
      financialHealth({
        spent: sp,
        goal: cfg.monthlyGoal,
        income: income.totalIncome,
        futureInstallments: futureInst,
        paidRatio: billsPaidRatio(statements[addMonths(m, -1)]?.data.bankBills),
      });
    const nextInstallments = projectInstallments(allTxs, month, 1)[0]?.total ?? 0;
    const prevSpend = coupleSpendOf(prevMonth);
    const coupleSpend = coupleSpendOf(month);
    const prevInstallments = projectInstallments(byMonth[prevMonth] ?? [], prevMonth, 1)[0]?.total ?? 0;
    const finHealth = healthOf(month, coupleSpend.total, nextInstallments);
    const prevFinHealth = prevSpend.status === "empty" ? null : healthOf(prevMonth, prevSpend.total, prevInstallments);
    const engine = new RuleBasedSavingsEngine({ month, byMonth, config: cfg });
    const recommendations = engine.analyze();
    const candidates = engine.simulatorCandidates();
    const suggestedSubscriptions = detectRecurringMerchants(byMonth, month, 3).filter((key) => {
      const t = allTxs.find((x) => x.merchantKey === key);
      return t && !isSubscription(t, cfg);
    });
    const subscriptions = allTxs.filter((t) => t.amount > 0 && isSubscription(t, cfg));

    return {
      month,
      prevMonth,
      config: cfg,
      users: cfg.users,
      txs,
      allTxs,
      total,
      prevTotal,
      totalDelta: deltaPct(total, prevTotal),
      coupleTotal,
      shares,
      prevShares,
      settlement,
      prevSettlement,
      recurringExpenses,
      sectors,
      health,
      evolution,
      installments,
      recommendations,
      candidates,
      suggestedSubscriptions,
      subscriptions,
      snapshot: statements[month]?.data.snapshot,
      openMonth,
      view,
      viewDebts,
      goal,
      spend,
      strip,
      timeline,
      composition,
      income,
      finHealth,
      prevFinHealth,
      byMonth,
    };
  }, [state, view]);
}

export type Derived = NonNullable<ReturnType<typeof useDerivedOptional>>;

"use client";

import { useMemo } from "react";
import { addMonths, monthRange } from "../domain/months";
import { formatBRL, formatPct, pctOf } from "../domain/money";
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
import { useStore } from "./store";

/**
 * Formatador único de valores. No Modo Privacidade NENHUM valor em R$ é exibido:
 * tudo vira percentual sobre uma base (por padrão, a fatura consolidada do mês).
 */
export interface Fmt {
  privacy: boolean;
  money: (cents: Cents, base?: Cents, opts?: { compact?: boolean; signed?: boolean }) => string;
  pct: (value: number) => string;
  baseLabel: string;
}

export function useFmt(defaultBase?: Cents): Fmt {
  const { privacy } = useStore();
  const derived = useDerivedOptional();
  const base = defaultBase ?? derived?.total ?? 0;
  return useMemo(
    () => ({
      privacy,
      baseLabel: "da fatura",
      pct: formatPct,
      money: (cents, b, opts) => {
        if (privacy) {
          const v = pctOf(cents, b ?? base);
          return `${opts?.signed && v > 0 ? "+" : ""}${formatPct(v)}`;
        }
        const s = formatBRL(cents, opts?.compact);
        return opts?.signed && cents > 0 ? `+${s}` : s;
      },
    }),
    [privacy, base],
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
      byMonth,
    };
  }, [state, view]);
}

export type Derived = NonNullable<ReturnType<typeof useDerivedOptional>>;

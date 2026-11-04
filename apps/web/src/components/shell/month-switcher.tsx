"use client";

import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { useStore } from "@/lib/client/store";
import { addMonths, monthLabel } from "@/lib/domain/months";

export function MonthSwitcher() {
  const { state, setMonth } = useStore();
  if (!state) return null;
  const { month, availableMonths } = state;
  const min = availableMonths[0] ?? month;
  const max = availableMonths.at(-1) ?? month;
  const closed = Boolean(state.statements[month]?.data.snapshot);
  return (
    <div className="flex items-center gap-2">
      <button
        className="inline-flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-zinc-600 shadow-soft disabled:opacity-40"
        onClick={() => setMonth(addMonths(month, -1))}
        disabled={month <= min}
        aria-label="Mês anterior"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="inline-flex min-w-36 items-center justify-center gap-1.5 text-sm font-semibold text-zinc-900">
        {monthLabel(month)}
        {closed && <Lock className="size-3.5 text-emerald-600" aria-label="Mês fechado" />}
      </span>
      <button
        className="inline-flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-zinc-600 shadow-soft disabled:opacity-40"
        onClick={() => setMonth(addMonths(month, 1))}
        disabled={month >= max}
        aria-label="Próximo mês"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

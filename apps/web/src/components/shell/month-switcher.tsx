"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { useStore } from "@/lib/client/store";
import { addMonths, monthLabel } from "@/lib/domain/months";
import type { MonthKey, StatementFile } from "@/lib/domain/types";

function currentMonth(): MonthKey {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Situação da fatura do mês pelo que o banco informou (Open Finance). */
export function billStatus(file: StatementFile | undefined, month: MonthKey): { label: string; tone: string } | null {
  const bills = Object.values(file?.bankBills ?? {});
  if (bills.length) {
    if (bills.every((b) => b.status === "paga")) return { label: "Paga", tone: "bg-emerald-50 text-emerald-700" };
    if (bills.some((b) => b.status === "parcial")) return { label: "Paga em parte", tone: "bg-amber-50 text-amber-700" };
    return { label: "Em aberto", tone: "bg-rose-50 text-rose-700" };
  }
  if (month >= currentMonth() && file?.transactions.some((t) => t.source === "pluggy")) {
    return { label: "Em aberto", tone: "bg-rose-50 text-rose-700" };
  }
  return null;
}

export function MonthSwitcher() {
  const { state, setMonth } = useStore();
  if (!state) return null;
  const { month, availableMonths } = state;
  const today = currentMonth();
  const options = [...new Set([...availableMonths, today, month])].sort();
  const min = options[0];
  const max = options.at(-1)!;
  const file = state.statements[month]?.data;
  const closed = Boolean(file?.snapshot);
  const status = billStatus(file, month);
  const arrow =
    "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-zinc-600 shadow-soft disabled:opacity-40";
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button className={arrow} onClick={() => setMonth(addMonths(month, -1))} disabled={month <= min} aria-label="Mês anterior">
          <ChevronLeft className="size-4" />
        </button>
        <label className="relative inline-flex min-w-36 items-center justify-center gap-1 text-sm font-semibold text-zinc-900">
          {monthLabel(month)}
          {closed ? <Lock className="size-3.5 text-emerald-600" aria-label="Mês fechado" /> : <ChevronDown className="size-3.5 text-zinc-400" />}
          {/* Lista nativa do celular: toque no nome do mês para escolher. */}
          <select
            className="absolute inset-0 cursor-pointer opacity-0"
            value={month}
            onChange={(e) => setMonth(e.target.value as MonthKey)}
            aria-label="Escolher mês"
          >
            {[...options].reverse().map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
                {m === today ? " (atual)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button className={arrow} onClick={() => setMonth(addMonths(month, 1))} disabled={month >= max} aria-label="Próximo mês">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        {status && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}>Fatura {status.label.toLowerCase()}</span>}
        {month !== today && (
          <button className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-[11px] font-semibold text-white" onClick={() => setMonth(today)}>
            Ir para o mês atual
          </button>
        )}
      </div>
    </div>
  );
}

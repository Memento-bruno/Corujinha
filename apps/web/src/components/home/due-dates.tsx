"use client";

import { CalendarClock, Plus } from "lucide-react";
import { useState } from "react";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import type { RecurringDebt } from "@/lib/domain/types";
import { isDebtActiveIn } from "@/lib/engines/settlement";
import { DebtSheet, newDebt } from "../faturas/recurring-tab";

function todayBR(): { month: string; day: number } {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return { month: s.slice(0, 7), day: Number(s.slice(8, 10)) };
}

/** Lembretes de vencimento do mês (água, internet, parcela do carro...), em ordem de data. */
export function DueDates() {
  const { state } = useStore();
  const d = useDerived();
  const fmt = useFmt(d.spend.total);
  const [editing, setEditing] = useState<RecurringDebt | null>(null);
  const today = todayBR();
  const [y, m] = d.month.split("-");
  const lastDay = new Date(Number(y), Number(m), 0).getDate();
  const items = state!.recurring.data.debts
    .filter((x) => x.kind !== "CARTAO" && isDebtActiveIn(x, d.month))
    .map((x) => {
      const day = Math.min(x.dueDay, lastDay);
      const diff = d.month === today.month ? day - today.day : d.month < today.month ? -99 : 99;
      return { x, day, diff };
    })
    .sort((a, b) => a.day - b.day);

  const chip = (diff: number) => {
    if (diff === -99) return { text: "mês passado", tone: "bg-zinc-100 text-zinc-600" };
    if (diff === 99) return { text: "próximo mês", tone: "bg-zinc-100 text-zinc-600" };
    if (diff < 0) return { text: `venceu há ${-diff} dia${diff === -1 ? "" : "s"}`, tone: "bg-red-100 text-red-800" };
    if (diff === 0) return { text: "vence hoje", tone: "bg-orange-100 text-orange-800" };
    if (diff <= 3) return { text: `em ${diff} dia${diff === 1 ? "" : "s"}`, tone: "bg-orange-100 text-orange-800" };
    return { text: `em ${diff} dias`, tone: "bg-green-100 text-green-800" };
  };

  return (
    <section aria-labelledby="due-title" className="rounded-3xl border border-[#ebebef] bg-white p-4 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="due-title" className="flex items-center gap-2 text-[15px] font-bold">
          <CalendarClock className="size-[18px] text-[#4f52d6]" /> Próximos vencimentos
        </h2>
        <button
          type="button"
          onClick={() => setEditing({ ...newDebt(d.month), kind: "CONTA_FIXA", paidBy: state!.viewer.userId })}
          className="inline-flex h-9 items-center gap-1 rounded-full border border-zinc-300 bg-white px-3 text-sm font-semibold"
        >
          <Plus className="size-4" /> Vencimento
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">Cadastre as contas com vencimento (água, luz, internet, parcela do carro...) para ser lembrado aqui.</p>
      ) : (
        <ul className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
          {items.map(({ x, day, diff }) => {
            const c = chip(diff);
            return (
              <li key={x.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing(x)}
                  className="flex min-w-[168px] flex-col items-start gap-1 rounded-2xl border border-zinc-200 bg-[#F4F5F7]/60 px-3.5 py-2.5 text-left hover:bg-[#F4F5F7]"
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-xs font-bold text-zinc-500">
                      {String(day).padStart(2, "0")}/{m}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.tone}`}>{c.text}</span>
                  </span>
                  <span className="max-w-[200px] truncate text-sm font-semibold">{x.description}</span>
                  <span className="tabular text-sm font-bold">{fmt.money(x.amount)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <DebtSheet editing={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useDerived } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import { useDragScroll } from "@/lib/client/use-drag-scroll";
import { monthLabel, monthShort } from "@/lib/domain/months";
import type { MonthStatus } from "@/lib/engines/overview";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<MonthStatus, string> = {
  ok: "sem aperto",
  over: "aperto",
  open: "em aberto",
  forecast: "previsto",
  empty: "sem dados",
};

const TONE: Record<MonthStatus, string> = {
  ok: "border-green-300 bg-green-100 text-green-900",
  over: "border-red-300 bg-red-100 text-red-900",
  open: "border-orange-300 bg-orange-50 text-orange-900",
  forecast: "border-dashed border-zinc-300 bg-white text-zinc-500",
  empty: "border-zinc-200 bg-zinc-50 text-zinc-400",
};


/**
 * Faixa com 12 meses em volta da fatura em aberto. Verde = ficou dentro da meta,
 * vermelho = passou da meta (aperto), tracejado = previsto. O mês aberto na tela fica preto.
 * No fim, o botão "Hoje" volta para a fatura em aberto.
 */
export function MonthStrip() {
  const { setMonth } = useStore();
  const d = useDerived();
  const [ref, drag] = useDragScroll<HTMLDivElement>();
  useEffect(() => {
    // Centraliza o mês aberto rolando só a faixa (scrollIntoView também rolava a página e a tela pulava).
    const box = ref.current;
    const el = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!box || !el) return;
    const left = el.offsetLeft - box.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
    box.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [d.month, ref]);
  return (
    <nav aria-label="Escolher mês" className="flex min-w-0 max-w-full gap-1.5 rounded-[18px] border border-[#ebebef] bg-white p-1">
      <div
        ref={ref}
        {...drag}
        className="no-scrollbar -m-1 flex min-w-0 cursor-grab gap-1.5 overflow-x-auto p-1 select-none active:cursor-grabbing"
      >
        {d.strip.map((s, i) => {
          const selected = s.month === d.month;
          const firstOfYear = i > 0 && s.month.endsWith("-01");
          return (
            <button
              key={s.month}
              type="button"
              onClick={() => setMonth(s.month)}
              aria-current={selected ? "true" : undefined}
              aria-label={`${monthLabel(s.month)}, ${STATUS_LABEL[s.status]}`}
              title={`${monthLabel(s.month)}: ${STATUS_LABEL[s.status]}`}
              className={cn(
                "flex h-12 min-w-[52px] flex-1 shrink-0 flex-col items-center justify-center rounded-[14px] border text-center transition",
                firstOfYear && "ml-2",
                selected ? "border-zinc-900 bg-zinc-900 text-white" : TONE[s.status],
                s.status === "open" && "ring-[3px] ring-orange-300",
              )}
            >
              <span className="text-sm leading-tight font-bold">{monthShort(s.month)}</span>
              <span className={cn("text-[10px] leading-tight font-semibold", selected ? "text-white/70" : "opacity-70")}>{s.month.slice(0, 4)}</span>
            </button>
          );
        })}
      </div>
      {/* "Hoje" fica fora da parte que rola: sempre à vista, mesmo quando os meses não cabem. */}
      <button
        type="button"
        onClick={() => setMonth(d.openMonth)}
        disabled={d.month === d.openMonth}
        className="ml-1 flex h-12 shrink-0 items-center rounded-[14px] bg-[#4f52d6] px-3.5 text-sm font-bold text-white transition disabled:bg-zinc-100 disabled:text-zinc-400"
        title="Voltar para a fatura em aberto"
      >
        Hoje
      </button>
    </nav>
  );
}

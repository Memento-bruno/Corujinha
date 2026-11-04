"use client";

import { useState } from "react";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import { useReveal } from "@/lib/client/use-reveal";
import { formatPct } from "@/lib/domain/money";
import { monthName, monthShort } from "@/lib/domain/months";
import { COMPOSITION } from "@/lib/engines/overview";
import { niceMax } from "./evolution-chart";

const H = 300;

/**
 * Barras empilhadas: do que é feito cada mês (contas, parcelas e categorias).
 * Meses previstos ficam listrados. Embaixo, o detalhe do mês apontado (ou do mês aberto).
 */
export function CompositionChart() {
  const { setMonth } = useStore();
  const d = useDerived();
  const fmt = useFmt(d.spend.total);
  const data = d.composition;
  const max = niceMax(Math.max(...data.map((m) => m.total)) * 1.1);
  const [ref, shown] = useReveal<HTMLElement>();
  const [hover, setHover] = useState<string | null>(null);
  const focus = data.find((m) => m.month === (hover ?? d.month)) ?? data[4];
  const grid = [0.25, 0.5, 0.75, 1];

  return (
    <section ref={ref} aria-labelledby="stack-title" className="rounded-3xl border border-[#ebebef] bg-white p-4 sm:p-6">
      <h2 id="stack-title" className="text-lg font-bold">Do que é feito cada mês</h2>
      <p className="mt-1 text-sm text-zinc-600">Os meses depois de {monthName(d.openMonth)} são previstos (listrados).</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {COMPOSITION.map((c) => (
          <span key={c.key} className="flex items-center gap-1.5 rounded-full bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700">
            <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
            {c.label}
          </span>
        ))}
      </div>

      <div className="mt-5">
        <div className="relative" style={{ height: H + 28 }}>
          {grid.map((g) => (
            <span key={g} className="absolute inset-x-0 border-t border-dashed border-zinc-200" style={{ bottom: 28 + g * H }} aria-hidden>
              {!fmt.privacy && <span className="absolute -top-4 left-0 text-[10px] font-semibold text-zinc-400">{fmt.num(g * max)}</span>}
            </span>
          ))}
          <div className="absolute inset-x-0 top-0 flex items-end gap-1 pl-7 sm:gap-3 sm:pl-8" style={{ height: H }}>
            {data.map((m, i) => {
              const sel = m.month === d.month;
              const h = (m.total / max) * H;
              return (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => setMonth(m.month)}
                  onMouseEnter={() => setHover(m.month)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(m.month)}
                  onBlur={() => setHover(null)}
                  className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  aria-label={`${monthName(m.month)}${m.forecast ? " (previsto)" : ""}: ${fmt.money(m.total)}`}
                >
                  <span
                    className={`tabular mb-1.5 rounded-full px-1 py-0.5 text-[9px] font-extrabold sm:px-2 sm:text-[11px] whitespace-nowrap transition-opacity duration-300 ${sel ? "bg-zinc-900 text-white" : "text-zinc-700"}`}
                    style={{ opacity: shown ? 1 : 0, transitionDelay: `${500 + i * 60}ms` }}
                  >
                    {fmt.num(m.total)}
                  </span>
                  <span
                    className={`relative flex w-full max-w-14 flex-col-reverse gap-[2px] overflow-hidden rounded-xl transition-[height] duration-700 ease-out group-hover:brightness-105 motion-reduce:transition-none ${sel ? "outline-2 outline-offset-2 outline-zinc-900" : ""}`}
                    style={{ height: shown ? h : 0, transitionDelay: `${i * 60}ms` }}
                  >
                    {COMPOSITION.map((c) => {
                      const v = m.parts[c.key];
                      if (v <= 0) return null;
                      const sh = (v / max) * H;
                      return (
                        <span
                          key={c.key}
                          className="tabular flex shrink-0 items-center justify-center overflow-hidden rounded-[5px] text-[9px] font-bold sm:text-[11px]"
                          style={{ height: Math.max(2, sh - 2), background: c.color, color: c.text }}
                        >
                          {sh >= 22 ? <span className="hidden sm:inline">{fmt.num(v)}</span> : ""}
                        </span>
                      );
                    })}
                    {m.forecast && (
                      <span
                        className="pointer-events-none absolute inset-0"
                        style={{ background: "repeating-linear-gradient(135deg, rgba(255,255,255,.55) 0 5px, transparent 5px 10px)" }}
                        aria-hidden
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex gap-1 border-t border-zinc-200 pt-2 pl-7 sm:gap-3 sm:pl-8">
            {data.map((m) => (
              <span key={m.month} className={`min-w-0 flex-1 text-center text-[10px] sm:text-xs ${m.month === d.month ? "font-extrabold text-zinc-900" : "font-semibold text-zinc-500"}`}>
                {monthShort(m.month)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {focus && (
        <div className="mt-4 rounded-2xl bg-[#F4F5F7] p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold first-letter:uppercase">
              {monthName(focus.month)}
              {focus.forecast ? " (previsto)" : ""}
            </span>
            <span className="tabular text-sm font-extrabold">{fmt.money(focus.total)}</span>
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            {COMPOSITION.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                  {c.label}
                </span>
                <b className="tabular shrink-0">{focus.total > 0 ? formatPct(Math.round((focus.parts[c.key] / focus.total) * 100)) : "0%"}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

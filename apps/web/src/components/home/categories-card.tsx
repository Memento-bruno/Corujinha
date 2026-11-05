"use client";

import Link from "next/link";
import { useState } from "react";
import { Segmented } from "../ui/segmented";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import { GROW, useReveal } from "@/lib/client/use-reveal";
import { CATEGORIES } from "@/lib/domain/categories";
import { formatPct } from "@/lib/domain/money";
import { monthName } from "@/lib/domain/months";
import type { CategoryId } from "@/lib/domain/types";
import { isDebtActiveIn } from "@/lib/engines/settlement";

/** Para onde foi o dinheiro: categorias do mês (cartão + contas fora do cartão), com o teto de cada uma. */
export function CategoriesCard() {
  const { state } = useStore();
  const d = useDerived();
  const fmt = useFmt(d.spend.total);
  const totals = new Map<CategoryId, number>();
  for (const t of d.txs) totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
  for (const debt of d.viewDebts) {
    if (debt.kind !== "CARTAO" && isDebtActiveIn(debt, d.month)) totals.set(debt.category, (totals.get(debt.category) ?? 0) + debt.amount);
  }
  const rows = [...totals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = rows[0]?.[1] ?? 1;
  const sum = rows.reduce((s, [, v]) => s + v, 0);
  const [ref, shown] = useReveal<HTMLElement>();
  const [mode, setMode] = useState<"donut" | "bars">("donut");
  return (
    <section ref={ref} aria-labelledby="cat-title" className="min-w-0 flex-[1_1_400px] rounded-3xl border border-[#ebebef] bg-white p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="cat-title" className="text-base font-bold sm:text-lg">Para onde foi o dinheiro</h2>
          <p className="mt-1 text-[13px] text-zinc-600 first-letter:uppercase sm:text-sm">{monthName(d.month)}, por categoria</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "donut", label: "Rosca" },
              { value: "bars", label: "Barras" },
            ]}
          />
          <Link href="/metas" className="inline-flex h-9 items-center rounded-full border border-zinc-300 bg-white px-3.5 text-sm font-semibold">
            Metas
          </Link>
        </div>
      </div>
      {rows.length === 0 && <p className="mt-5 text-sm text-zinc-500">Nenhum gasto neste mês ainda.</p>}
      {mode === "donut" && rows.length > 0 && <Donut rows={rows} sum={sum} shown={shown} center={fmt.money(sum)} />}
      <ul className={`mt-5 flex flex-col gap-3.5 ${mode === "donut" ? "hidden" : ""}`}>
        {rows.slice(0, 8).map(([cat, v], i) => {
          const budget = d.config.sectorBudgets[cat];
          const over = budget !== undefined && v > budget;
          const meta = CATEGORIES[cat];
          return (
            <li key={cat}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-semibold">{meta.label}</span>
                <span className="tabular">
                  <b>{fmt.money(v)}</b> <span className="text-zinc-600">· {formatPct(Math.round((v / sum) * 100))}</span>
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full rounded-full ${GROW}`}
                  style={{ width: shown ? `${(v / top) * 100}%` : "0%", background: over ? "#dc2626" : meta.color, transitionDelay: `${i * 70}ms` }}
                />
              </div>
              {budget !== undefined && (
                <div className={`mt-1 text-xs ${over ? "text-red-700" : "text-zinc-600"}`}>
                  {over ? `Passou ${fmt.money(v - budget, budget)} do teto de ${fmt.money(budget, budget)}` : `Teto ${fmt.money(budget, budget)} · ainda pode ${fmt.money(budget - v, budget)}`}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Rosca por categoria (6 maiores + demais), preenchendo em sequência quando aparece na tela. */
function Donut({ rows, sum, shown, center }: { rows: [CategoryId, number][]; sum: number; shown: boolean; center: string }) {
  const top = rows.slice(0, 6).map(([c, v]) => ({ key: c as string, name: CATEGORIES[c].label, value: v, color: CATEGORIES[c].color }));
  const rest = rows.slice(6).reduce((s, [, v]) => s + v, 0);
  const data = rest > 0 ? [...top, { key: "rest", name: "Demais", value: rest, color: "#cbd5e1" }] : top;
  const R = 70;
  const C = 2 * Math.PI * R;
  const GAP = data.length > 1 ? 3 : 0;
  let acc = 0;
  const segs = data.map((x, i) => {
    const len = Math.max(0, (x.value / sum) * C - GAP);
    const seg = { ...x, len, offset: -acc, delay: (acc / C) * 900, dur: Math.max(120, (len / C) * 900), i };
    acc += (x.value / sum) * C;
    return seg;
  });
  return (
    <div className="mt-5">
      <div className="relative mx-auto size-56">
        <svg viewBox="0 0 180 180" className="size-full -rotate-90" role="img" aria-label={data.map((x) => `${x.name} ${Math.round((x.value / sum) * 100)} por cento`).join(", ")}>
          <circle cx="90" cy="90" r={R} fill="none" stroke="#f4f4f5" strokeWidth="26" />
          {segs.map((x) => (
            <circle
              key={x.key}
              cx="90"
              cy="90"
              r={R}
              fill="none"
              stroke={x.color}
              strokeWidth="26"
              strokeDasharray={`${shown ? x.len : 0} ${C}`}
              strokeDashoffset={x.offset}
              className="motion-reduce:transition-none"
              style={{ transition: `stroke-dasharray ${x.dur}ms linear`, transitionDelay: `${x.delay}ms` }}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-xl font-extrabold">{center}</span>
          <span className="text-[11px] text-zinc-500">gasto no mês</span>
        </div>
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        {data.map((x) => (
          <li key={x.key} className="flex items-center gap-3 rounded-2xl border border-zinc-100 px-3 py-2.5">
            <span className="size-2.5 rounded-full" style={{ background: x.color }} aria-hidden />
            <span className="flex-1 truncate text-sm font-medium">{x.name}</span>
            <span className="tabular rounded-lg bg-[#eef0ff] px-2 py-0.5 text-xs font-bold text-[#4f52d6]">{formatPct(Math.round((x.value / sum) * 1000) / 10)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

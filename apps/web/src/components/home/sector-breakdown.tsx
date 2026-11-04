"use client";

import { useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDerived, useFmt } from "@/lib/client/derived";
import { CATEGORIES } from "@/lib/domain/categories";
import { pctOf } from "@/lib/domain/money";
import { categoryLabel } from "@/lib/engines/analytics";
import { Card, CardHeader } from "../ui/card";
import { Segmented } from "../ui/segmented";
import { DarkTooltip } from "./chart-tooltip";

export function SectorBreakdown() {
  const d = useDerived();
  const fmt = useFmt(d.total);
  const [mode, setMode] = useState<"donut" | "bars">("donut");
  const top = d.sectors.slice(0, 6);
  const rest = d.sectors.slice(6).reduce((s, x) => s + x.amount, 0);
  const data = [
    ...top.map((s) => ({ key: s.category, name: categoryLabel(s.category), value: s.amount, color: CATEGORIES[s.category].color })),
    ...(rest > 0 ? [{ key: "rest", name: "Demais", value: rest, color: "#cbd5e1" }] : []),
  ];
  const positiveTotal = data.reduce((s, x) => s + x.value, 0);

  return (
    <Card>
      <CardHeader
        title="Onde o casal mais gasta"
        subtitle="Setores do mês"
        action={
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "donut", label: "Rosca" },
              { value: "bars", label: "Barras" },
            ]}
          />
        }
      />
      {mode === "donut" ? (
        <div className="relative mx-auto h-56 w-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                {data.map((x) => (
                  <pattern key={x.key} id={`stripe-${x.key}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill={x.color} />
                    <rect width="2" height="6" fill="#ffffff" opacity="0.35" />
                  </pattern>
                ))}
              </defs>
              <Pie data={data} dataKey="value" innerRadius="66%" outerRadius="100%" paddingAngle={2} cornerRadius={6} stroke="none" startAngle={90} endAngle={-270}>
                {data.map((x) => (
                  <Cell key={x.key} fill={`url(#stripe-${x.key})`} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  const p = payload?.[0];
                  return (
                    <DarkTooltip
                      active={active}
                      rows={p ? [{ label: String(p.name), value: fmt.money(Number(p.value)), color: (p.payload as { color: string }).color }] : []}
                      title={p ? `${fmt.pct(pctOf(Number(p.value), positiveTotal))} do total` : undefined}
                    />
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="tabular text-xl font-bold text-zinc-900">{fmt.money(d.total)}</span>
            <span className="text-[11px] text-zinc-500">gasto no mês</span>
          </div>
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#52525b" }} />
              <Tooltip
                cursor={{ fill: "#f4f4f5" }}
                content={({ active, payload }) => {
                  const p = payload?.[0];
                  return <DarkTooltip active={active} rows={p ? [{ label: String(p.payload.name), value: fmt.money(Number(p.value)) }] : []} />;
                }}
              />
              <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={14}>
                {data.map((x) => (
                  <Cell key={x.key} fill={x.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <ul className="mt-4 space-y-2">
        {data.map((x) => (
          <li key={x.key} className="flex items-center gap-3 rounded-2xl border border-slate-100 px-3 py-2.5">
            <span className="size-2.5 rounded-full" style={{ background: x.color }} />
            <span className="flex-1 truncate text-sm font-medium text-zinc-800">{x.name}</span>
            {!fmt.privacy && <span className="tabular text-sm font-bold text-zinc-900">{fmt.money(x.value)}</span>}
            <span className="tabular rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-600">
              {fmt.pct(pctOf(x.value, positiveTotal))}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

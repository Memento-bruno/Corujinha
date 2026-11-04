"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import { monthLabel, monthShort } from "@/lib/domain/months";
import { formatBRL, formatPct, pctOf } from "@/lib/domain/money";
import { Card, CardHeader } from "../ui/card";
import { DeltaPill } from "../ui/delta-pill";
import { DarkTooltip } from "./chart-tooltip";

const COLORS = { USER_A: "#8b8ff5", USER_B: "#34c79a", total: "#6c6ff0" };

export function SpendingChart() {
  const { view, privacy } = useStore();
  const d = useDerived();
  const goal = d.config.monthlyGoal || 1;
  const fmt = useFmt(d.coupleTotal);
  // No Modo Privacidade o eixo vira "% da meta mensal"
  const val = (c: number) => (privacy ? Math.round(pctOf(c, goal) * 10) / 10 : c / 100);
  const data = d.evolution.map((e) => ({
    month: e.month,
    label: monthShort(e.month),
    USER_A: val(e.USER_A),
    USER_B: val(e.USER_B),
    total: val(e.total),
  }));
  const series = view === "COUPLE" ? (["USER_A", "USER_B"] as const) : ([view] as const);
  const tick = (v: number) => (privacy ? `${Math.round(v)}%` : formatBRL(v * 100, true).replace(/\s/g, ""));

  return (
    <Card>
      <CardHeader title="Evolução dos gastos" subtitle={privacy ? "% da meta mensal do casal" : "Últimos 6 meses"} />
      <div className="tabular text-2xl font-bold text-zinc-900">{fmt.money(d.total)}</div>
      <DeltaPill value={d.totalDelta} className="mt-1" />
      <div className="mt-2 flex gap-4 text-xs text-zinc-500">
        {series.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: COLORS[s] }} />
            {d.users[s].name.split(" ")[0]}
          </span>
        ))}
      </div>
      <div className="-mx-2 mt-2 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s} id={`fill-${s}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS[s]} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={COLORS[s]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="#e4e4e7" strokeDasharray="3 4" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#71717a" }} />
            <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 10, fill: "#a1a1aa" }} tickFormatter={tick} />
            <Tooltip
              cursor={{ stroke: "#6c6ff0", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                return (
                  <DarkTooltip
                    active={active}
                    title={p ? monthLabel(p.month) : undefined}
                    rows={(payload ?? []).map((x) => ({
                      label: d.users[x.dataKey as "USER_A" | "USER_B"].name.split(" ")[0],
                      value: privacy ? formatPct(Number(x.value)) : formatBRL(Number(x.value) * 100),
                      color: COLORS[x.dataKey as "USER_A" | "USER_B"],
                    }))}
                  />
                );
              }}
            />
            {series.map((s) => (
              <Area
                key={s}
                type="monotone"
                dataKey={s}
                stroke={COLORS[s]}
                strokeWidth={2.5}
                fill={`url(#fill-${s})`}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

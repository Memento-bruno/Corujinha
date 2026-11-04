"use client";

import { CalendarClock } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useDerived, useFmt } from "@/lib/client/derived";
import { monthLabel, monthShort } from "@/lib/domain/months";
import { Card, CardHeader } from "../ui/card";
import { IconBox } from "../ui/icon-box";
import { DarkTooltip } from "./chart-tooltip";

export function InstallmentsChart() {
  const d = useDerived();
  const fmt = useFmt(d.total);
  const data = d.installments.filter((m) => m.total > 0).map((m) => ({ ...m, label: monthShort(m.month) }));
  const committed = data.reduce((s, m) => s + m.total, 0);
  return (
    <Card>
      <CardHeader
        icon={<IconBox><CalendarClock /></IconBox>}
        title="Parcelas futuras já contratadas"
        subtitle={fmt.privacy ? "% da fatura deste mês" : `${fmt.money(committed)} comprometidos nos próximos meses`}
      />
      {data.length === 0 ? (
        <p className="rounded-2xl bg-slate-50 p-4 text-sm text-zinc-500">Nenhuma compra parcelada neste mês.</p>
      ) : (
        <>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#71717a" }} />
                <Tooltip
                  cursor={{ fill: "#f4f4f5", radius: 8 }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                    return (
                      <DarkTooltip
                        active={active}
                        title={p ? monthLabel(p.month) : undefined}
                        rows={
                          p
                            ? [
                                { label: d.users.USER_A.name.split(" ")[0], value: fmt.money(p.USER_A), color: "#8b8ff5" },
                                { label: d.users.USER_B.name.split(" ")[0], value: fmt.money(p.USER_B), color: "#34c79a" },
                              ]
                            : []
                        }
                      />
                    );
                  }}
                />
                <Bar dataKey="USER_A" stackId="a" fill="#8b8ff5" radius={[0, 0, 6, 6]} />
                <Bar dataKey="USER_B" stackId="a" fill="#34c79a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {d.txs
              .filter((t) => t.installment)
              .map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-zinc-700">{t.description}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-zinc-600">
                      {String(t.installment!.current).padStart(2, "0")}/{String(t.installment!.total).padStart(2, "0")}
                    </span>
                    <span className="tabular font-semibold text-zinc-900">{fmt.money(t.amount)}</span>
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
    </Card>
  );
}

"use client";

import { Gauge, Layers, Target } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useDerived, useFmt } from "@/lib/client/derived";
import { categoryLabel, sectorTotals } from "@/lib/engines/analytics";
import { pctOf } from "@/lib/domain/money";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { IconBox } from "../ui/icon-box";

/** Medidor semicircular 0-100 em SVG puro. */
function SemiGauge({ score, label }: { score: number; label: string }) {
  const r = 80;
  const c = Math.PI * r;
  const offset = c * (1 - score / 100);
  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 200 112" className="w-full">
        <defs>
          <linearGradient id="gauge" x1="0" x2="1">
            <stop offset="0%" stopColor="#6c6ff0" />
            <stop offset="100%" stopColor="#7aa7f7" />
          </linearGradient>
        </defs>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#e4e4ef" strokeWidth="22" strokeLinecap="butt" />
        <motion.path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke="url(#gauge)"
          strokeWidth="22"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-1 text-center">
        <div className="text-xs font-medium text-zinc-500">{label}</div>
        <div className="tabular text-3xl font-bold text-zinc-900">
          {score}
          <span className="text-lg text-zinc-400">/100</span>
        </div>
      </div>
    </div>
  );
}

export function HealthGauge() {
  const d = useDerived();
  const fmt = useFmt(d.coupleTotal);
  const sectors = sectorTotals(d.allTxs, d.config).filter((s) => s.budget);
  const within = sectors.filter((s) => s.amount <= (s.budget ?? 0)).length;
  const ratio = d.health.ratioToGoal;
  const quality = (ok: boolean, warn: boolean) => (ok ? "Excelente" : warn ? "Atenção" : "Boa");
  return (
    <Card>
      <CardHeader
        title="Saúde da fatura"
        subtitle="Gastos do mês vs. meta do casal"
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/cortes">Ver cortes</Link>
          </Button>
        }
      />
      <SemiGauge score={d.health.score} label={d.health.label} />
      <div className="mt-3 grid grid-cols-3 divide-x divide-slate-100 border-y border-slate-100 py-3 text-center">
        {[
          { icon: <Target />, label: "Meta", value: fmt.pct(ratio * 100), tone: quality(ratio <= 0.8, ratio > 1) },
          { icon: <Layers />, label: "Setores ok", value: `${within}/${sectors.length}`, tone: quality(within === sectors.length, within < sectors.length / 2) },
          { icon: <Gauge />, label: "Estourados", value: String(d.health.overBudgetSectors.length), tone: quality(d.health.overBudgetSectors.length === 0, d.health.overBudgetSectors.length > 2) },
        ].map((x) => (
          <div key={x.label} className="flex flex-col items-center gap-1 px-1">
            <IconBox className="size-7 rounded-lg [&_svg]:size-3.5">{x.icon}</IconBox>
            <span className="text-[11px] text-zinc-500">{x.label}</span>
            <span className="tabular text-xs font-bold text-zinc-900">{x.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-3.5">
        {sectors.map((s) => {
          const pct = pctOf(s.amount, s.budget ?? 1);
          const over = pct > 100;
          return (
            <div key={s.category}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-700">{categoryLabel(s.category)}</span>
                <span className="tabular text-zinc-500">
                  {fmt.privacy ? `${fmt.pct(pct)} do teto` : `${fmt.money(s.amount)} / ${fmt.money(s.budget ?? 0)}`}
                </span>
              </div>
              <div className="track-striped h-2.5 overflow-hidden rounded-full">
                <motion.div
                  className={cn("h-full rounded-full", over ? "bg-rose-400" : "bg-emerald-500")}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, pct)}%` }}
                  transition={{ duration: 0.8 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

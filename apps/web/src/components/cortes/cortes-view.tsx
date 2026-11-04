"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bug, Copy, Calculator, TrendingUp, Flame, PiggyBank, Repeat } from "lucide-react";
import { useMemo, useState } from "react";
import { useDerived, useFmt, type Fmt } from "@/lib/client/derived";
import { CATEGORIES } from "@/lib/domain/categories";
import { monthLabel } from "@/lib/domain/months";
import type { UserId } from "@/lib/domain/types";
import { simulateCuts, type SavingsRecommendation, type SavingsRule } from "@/lib/engines/savings";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { IconBox } from "../ui/icon-box";

const RULE_META: Record<SavingsRule, { label: string; icon: React.ReactNode; tint: string }> = {
  DUPLICATE_SUBSCRIPTION: { label: "Assinatura duplicada", icon: <Copy />, tint: "from-violet-50" },
  SUBSCRIPTION_INFLATION: { label: "Inflação silenciosa", icon: <TrendingUp />, tint: "from-rose-50" },
  SECTOR_OVERRUN: { label: "Estouro de média", icon: <Flame />, tint: "from-amber-50" },
  HIGH_FREQUENCY: { label: "Gasto formiguinha", icon: <Bug />, tint: "from-sky-50" },
};

const SEVERITY: Record<SavingsRecommendation["severity"], string> = {
  high: "bg-rose-50 text-rose-600",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-slate-100 text-zinc-600",
};
const SEVERITY_LABEL = { high: "Alta", medium: "Média", low: "Baixa" };

export function CortesView() {
  const d = useDerived();
  const fmt = useFmt(d.coupleTotal);
  const potential = d.recommendations.reduce((s, r) => s + r.monthlySavings, 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-base font-semibold text-zinc-900">Metas e sugestões de corte</h2>
      </div>
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-gradient-to-br from-brand-100 to-emerald-100 opacity-70 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <IconBox className="size-12 rounded-2xl [&_svg]:size-6">
            <PiggyBank />
          </IconBox>
          <div>
            <p className="text-xs text-zinc-500">Economia potencial em {monthLabel(d.month)}</p>
            <p className="tabular text-2xl font-bold text-zinc-900">
              {fmt.money(potential)}
              <span className="ml-1 text-sm font-medium text-zinc-500">/mês</span>
            </p>
            <p className="text-xs text-zinc-500">
              {fmt.privacy ? `${fmt.pct((potential / (d.coupleTotal || 1)) * 100)} da fatura` : `${fmt.money(potential * 12)} por ano`} ·{" "}
              {d.recommendations.length} alertas
            </p>
          </div>
        </div>
        <p className="relative mt-3 text-[11px] text-zinc-400">
          Motor de regras determinístico: nenhuma IA é usada. Cada alerta vem de uma regra matemática sobre as faturas.
        </p>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <AnimatePresence>
          {d.recommendations.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <RecommendationCard rec={r} fmt={fmt} name={(u) => d.users[u].name.split(" ")[0]} />
            </motion.div>
          ))}
        </AnimatePresence>
        {d.recommendations.length === 0 && <Card className="text-sm text-zinc-500 md:col-span-2">Nenhum alerta neste mês. Mandaram bem! 🎉</Card>}
      </div>

      <Simulator />
    </div>
  );
}

function RecommendationCard({ rec, fmt, name }: { rec: SavingsRecommendation; fmt: Fmt; name: (u: UserId) => string }) {
  const meta = RULE_META[rec.rule];
  const det = rec.details;
  let body: React.ReactNode = null;
  if (det.kind === "duplicate") {
    body = (
      <ul className="space-y-1">
        {det.merchants.map((m, i) => (
          <li key={i} className="flex justify-between text-xs text-zinc-600">
            <span className="truncate">
              {m.name} · cartão de {name(m.paidBy)}
            </span>
            <span className="tabular font-semibold text-zinc-800">{fmt.money(m.amount)}</span>
          </li>
        ))}
        <li className="pt-1 text-xs text-zinc-500">Sugestão: manter só uma (ou um plano família) e cancelar as demais.</li>
      </ul>
    );
  } else if (det.kind === "inflation") {
    const pct = ((det.current - det.previous) / det.previous) * 100;
    body = (
      <p className="text-xs text-zinc-600">
        Passou de <b className="tabular">{fmt.money(det.previous)}</b> ({monthLabel(det.previousMonth)}) para{" "}
        <b className="tabular">{fmt.money(det.current)}</b>: aumento de <b className="text-rose-600">{fmt.pct(pct)}</b>. Vale renegociar ou trocar de plano.
      </p>
    );
  } else if (det.kind === "overrun") {
    body = (
      <p className="text-xs text-zinc-600">
        {CATEGORIES[det.category].label}: <b className="tabular">{fmt.money(det.current)}</b> no mês
        {det.average3m > 0 && (
          <>
            {" "}contra média de <b className="tabular">{fmt.money(det.average3m)}</b> nos últimos 3 meses
            {det.overAveragePct !== null && <b className="text-rose-600"> (+{fmt.pct(det.overAveragePct)})</b>}
          </>
        )}
        {det.overBudget && det.budget !== undefined && (
          <>
            {" "}e acima do teto de <b className="tabular">{fmt.money(det.budget)}</b>
          </>
        )}
        .
      </p>
    );
  } else if (det.kind === "frequency") {
    body = (
      <div className="text-xs text-zinc-600">
        <p>
          <b>{det.occurrences} compras</b> somando <b className="tabular">{fmt.money(det.total)}</b>.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
            Reduzir 30% <b className="tabular block text-sm">{fmt.money(det.cut30)}</b>
          </div>
          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
            Reduzir 50% <b className="tabular block text-sm">{fmt.money(det.cut50)}</b>
          </div>
        </div>
      </div>
    );
  }
  return (
    <Card className={cn("h-full bg-gradient-to-br to-white to-60%", meta.tint)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500">
          <IconBox className="size-7 rounded-lg [&_svg]:size-3.5">{meta.icon}</IconBox>
          {meta.label}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", SEVERITY[rec.severity])}>{SEVERITY_LABEL[rec.severity]}</span>
      </div>
      <h3 className="mb-1.5 text-sm font-bold text-zinc-900">{rec.title}</h3>
      {body}
      {rec.monthlySavings > 0 && (
        <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          Economia estimada: <span className="tabular">{fmt.money(rec.monthlySavings)}</span>/mês
        </p>
      )}
    </Card>
  );
}

function Simulator() {
  const d = useDerived();
  const fmt = useFmt(d.coupleTotal);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const result = useMemo(() => simulateCuts(d.candidates, selected, d.coupleTotal), [d.candidates, selected, d.coupleTotal]);
  const toggle = (id: string, v: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });
  const subs = d.candidates.filter((c) => c.kind === "subscription");
  const vars = d.candidates.filter((c) => c.kind === "variable");
  const who = (p: UserId | "BOTH") => (p === "BOTH" ? "os dois" : d.users[p].name.split(" ")[0]);

  return (
    <Card>
      <CardHeader
        icon={<IconBox><Calculator /></IconBox>}
        title="E se cortarmos?"
        subtitle="Marque os itens e veja o impacto na fatura"
        action={
          selected.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Limpar
            </Button>
          )
        }
      />
      <div className="sticky top-2 z-10 mb-3 rounded-2xl bg-zinc-900 p-4 text-white shadow-float">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-400">Economia por mês</p>
            <motion.p key={result.savings} initial={{ scale: 0.96 }} animate={{ scale: 1 }} className="tabular text-2xl font-bold">
              {fmt.money(result.savings)}
            </motion.p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-400">da fatura</p>
            <p className="tabular text-lg font-bold text-emerald-400">−{fmt.pct(result.pctOfInvoice)}</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400" animate={{ width: `${Math.min(100, result.pctOfInvoice)}%` }} />
        </div>
        {!fmt.privacy && <p className="mt-2 text-xs text-zinc-400">Fatura simulada: <span className="tabular font-semibold text-white">{fmt.money(result.newTotal)}</span></p>}
      </div>
      {[
        { title: "Assinaturas", icon: <Repeat className="size-3.5" />, items: subs },
        { title: "Gastos variáveis", icon: <Bug className="size-3.5" />, items: vars },
      ].map((g) => (
        <div key={g.title} className="mb-3">
          <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">
            {g.icon} {g.title}
          </p>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
            {g.items.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-900">{c.label}</span>
                    <span className="block truncate text-[11px] text-zinc-500">
                      {CATEGORIES[c.category].label} · {c.occurrences}× · {who(c.paidBy)}
                    </span>
                  </span>
                  <span className="tabular text-sm font-semibold text-zinc-900">{fmt.money(c.monthlyAmount)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}

"use client";

import { ArrowRight, CheckCircle2, Info, Lock, LockOpen, Scale } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import { monthLabel } from "@/lib/domain/months";
import type { SettlementResult, UserId } from "@/lib/domain/types";
import { Avatar } from "../shell/avatar";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { IconBox } from "../ui/icon-box";
import { Sheet } from "../ui/sheet";

const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function AcertoView() {
  const { closeMonth } = useStore();
  const d = useDerived();
  const [confirm, setConfirm] = useState(false);
  // No snapshot, mostramos os números gravados no fechamento
  const s: SettlementResult = d.snapshot?.settlement ?? d.settlement;
  const fmt = useFmt(s.grossTotal);
  const name = (u: UserId) => d.users[u].name.split(" ")[0];
  const t = s.transfer;
  const cardsTotal = d.snapshot?.totalStatements ?? d.coupleTotal;
  const recurringTotal = d.snapshot?.totalRecurring ?? d.recurringExpenses.reduce((x, e) => x + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-base font-semibold text-zinc-900">Encontro de contas</h2>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="relative overflow-hidden p-5 sm:p-6">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{ background: "radial-gradient(90% 70% at 100% 0%, #e0e3ff 0%, transparent 60%), radial-gradient(70% 60% at 0% 100%, #d1fae5 0%, transparent 60%)" }}
          />
          <div className="relative">
            <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Acerto líquido de {monthLabel(d.month)}</p>
            {t ? (
              <>
                <div className="mt-4 flex items-center gap-3">
                  <Avatar user={d.users[t.from]} size={44} />
                  <ArrowRight className="size-5 text-zinc-400" />
                  <Avatar user={d.users[t.to]} size={44} />
                </div>
                <p className="mt-4 text-lg leading-snug text-zinc-700">
                  <b className="text-zinc-900">{name(t.from)}</b> deve pagar{" "}
                  <span className="tabular text-3xl font-bold text-zinc-900">{fmt.money(t.amount)}</span>
                  {fmt.privacy && <span className="text-sm text-zinc-500"> do total</span>} para <b className="text-zinc-900">{name(t.to)}</b>
                </p>
              </>
            ) : (
              <p className="mt-4 flex items-center gap-2 text-lg font-semibold text-emerald-700">
                <CheckCircle2 className="size-6" /> Tudo compensado: ninguém deve nada este mês.
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {d.snapshot ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                    <Lock className="size-3.5" /> Fechado em {DATE.format(new Date(d.snapshot.closedAt))} por {name(d.snapshot.closedBy)}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => void closeMonth(d.month, true)}>
                    <LockOpen /> Reabrir mês
                  </Button>
                </>
              ) : (
                <Button size="lg" onClick={() => setConfirm(true)}>
                  <Lock /> Fechar mês
                </Button>
              )}
            </div>
            <p className="mt-4 flex items-start gap-1.5 text-[11px] text-zinc-500">
              <Info className="mt-px size-3.5 shrink-0" />
              O Corujinha é somente leitura: ele calcula o acerto, mas a transferência é feita por vocês, fora do app.
            </p>
          </div>
        </Card>
      </motion.div>

      <Card>
        <CardHeader icon={<IconBox><Scale /></IconBox>} title="Memória de cálculo" subtitle="Total bruto → abatimentos cruzados → valor final" />
        <Step n={1} title="Total bruto do mês">
          <Row label="Faturas dos cartões" value={fmt.money(cardsTotal)} />
          <Row label="Dívidas e contas recorrentes" value={fmt.money(recurringTotal)} />
          <Row label="Total" value={fmt.money(s.grossTotal)} strong />
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["USER_A", "USER_B"] as const).map((u) => (
              <div key={u} className="rounded-2xl bg-slate-50 p-3 text-xs">
                <p className="font-semibold text-zinc-800">{name(u)}</p>
                <p className="mt-1 flex justify-between text-zinc-500">
                  Pagou <span className="tabular font-semibold text-zinc-800">{fmt.money(s.paid[u])}</span>
                </p>
                <p className="flex justify-between text-zinc-500">
                  Parte justa <span className="tabular font-semibold text-zinc-800">{fmt.money(s.fairShare[u])}</span>
                </p>
              </div>
            ))}
          </div>
        </Step>
        <Step n={2} title="Créditos de cada um">
          {(["USER_A", "USER_B"] as const).map((u) => {
            const o = u === "USER_A" ? "USER_B" : "USER_A";
            const c = s.credits[u];
            return (
              <div key={u} className="mb-3 rounded-2xl border border-slate-100 p-3">
                <p className="mb-1.5 text-xs font-semibold text-zinc-800">
                  {name(u)} tem a receber de {name(o)}
                </p>
                <Row label={`Parte de ${name(o)} nas compras conjuntas`} value={fmt.money(c.sharedCard)} />
                <Row label={`Compras só de ${name(o)} no cartão de ${name(u)}`} value={fmt.money(c.individualOnMyCard)} />
                <Row label={`Parte de ${name(o)} nas recorrentes`} value={fmt.money(c.sharedRecurring)} />
                <Row label={`Recorrentes só de ${name(o)}`} value={fmt.money(c.individualRecurring)} />
                <Row label="Subtotal" value={fmt.money(c.total)} strong />
              </div>
            );
          })}
        </Step>
        <Step n={3} title="Abatimento cruzado" last>
          <Row label="Valor que se cancela dos dois lados" value={`− ${fmt.money(s.crossOffset)}`} />
          <Row
            label={t ? `${name(t.from)} → ${name(t.to)}` : "Saldo final"}
            value={t ? fmt.money(t.amount) : fmt.money(0)}
            strong
            highlight
          />
        </Step>
      </Card>

      <Sheet open={confirm} onOpenChange={setConfirm} title={`Fechar ${monthLabel(d.month)}?`} description="Salva um snapshot do acerto no Google Drive e trava as transações do mês. Dá para reabrir depois.">
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setConfirm(false)}>
            Cancelar
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              setConfirm(false);
              void closeMonth(d.month);
            }}
          >
            <Lock /> Fechar mês
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function Step({ n, title, children, last }: { n: number; title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-bold text-white">{n}</span>
        {!last && <span className="my-1 w-px flex-1 bg-slate-200" />}
      </div>
      <div className="min-w-0 flex-1 pb-5">
        <p className="mb-2 text-sm font-semibold text-zinc-900">{title}</p>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, strong, highlight }: { label: string; value: string; strong?: boolean; highlight?: boolean }) {
  return (
    <div className={"flex items-center justify-between gap-3 py-1 text-[13px] " + (highlight ? "mt-1 rounded-xl bg-zinc-900 px-3 py-2 text-white" : "")}>
      <span className={highlight ? "font-semibold" : strong ? "font-semibold text-zinc-800" : "text-zinc-500"}>{label}</span>
      <span className={"tabular shrink-0 " + (strong || highlight ? "font-bold" : "font-semibold text-zinc-800")}>{value}</span>
    </div>
  );
}

"use client";

import { BookUser, FileUp, Loader2, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import { useDragScroll } from "@/lib/client/use-drag-scroll";
import { useReveal } from "@/lib/client/use-reveal";
import { addMonths, monthName } from "@/lib/domain/months";
import type { RecurringDebt, Transaction } from "@/lib/domain/types";
import { cardGroups, rootCardId } from "@/lib/domain/card-groups";
import { sumCents } from "@/lib/engines/analytics";
import { cn } from "@/lib/utils";
import { PERSON } from "../home/colors";
import { CreditCardVisual } from "../home/credit-card";
import { Sheet } from "../ui/sheet";
import { ImportTab } from "./import-tab";
import { ManualPurchaseSheet } from "./manual-purchase";
import { PaidBills } from "./paid-bills";
import { Purchases } from "./purchases";
import { DebtSheet, KINDS, RecurringTab, newDebt } from "./recurring-tab";
import { splitLabel } from "./split-badge";

const panel = "rounded-3xl border border-[#ebebef] bg-white p-4 sm:p-6";
const pillBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-60";

function ago(iso?: string): string | null {
  if (!iso) return null;
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const dd = Math.round(h / 24);
  return `há ${dd} dia${dd === 1 ? "" : "s"}`;
}

export function FaturasView() {
  const { state, view, syncBank, bankSyncing } = useStore();
  const d = useDerived();
  const fmt = useFmt(d.coupleTotal);
  const [cardId, setCardId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "importar" | "recorrentes" | "manual">(null);
  const [editingDebt, setEditingDebt] = useState<RecurringDebt | null>(null);
  const [ref, shown] = useReveal<HTMLElement>();
  const [rowRef, drag] = useDragScroll<HTMLDivElement>();

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "recorrentes" || t === "importar") setSheet(t);
  }, []);
  // Trocou a pessoa no topo: volta a mostrar todos os cartões dela.
  useEffect(() => setCardId(null), [view]);

  const bankReady = state!.mode.pluggyConfigured && (d.config.pluggyItems?.length ?? 0) > 0;
  const closed = Boolean(d.snapshot);
  const first = (u: "USER_A" | "USER_B") => d.users[u].name.split(" ")[0];
  const real = d.txs.filter((t) => !t.predictedFrom);
  const status = closed ? "Acerto fechado" : d.month === d.openMonth ? "Em aberto" : d.month > d.openMonth ? "Previsão" : "Fechada";

  // Cartões, do que mais gastou para o que menos gastou (na visão escolhida).
  const cards = useMemo(() => {
    // Virtuais e adicionais entram no cartão principal (é a mesma fatura).
    const list = cardGroups(d.config.cards)
      .map((g) => g.card)
      .filter((c) => view === "COUPLE" || c.owner === view)
      .map((c) => ({ c, total: sumCents(d.txs.filter((t) => rootCardId(t.cardId, d.config.cards) === c.id)) }))
      .sort((a, b) => b.total - a.total);
    return list;
  }, [d.config.cards, d.txs, view]);
  const cardsSum = Math.max(1, cards.reduce((s, x) => s + Math.max(0, x.total), 0));
  const usedCards = new Set(real.map((t) => rootCardId(t.cardId, d.config.cards))).size;

  // Como as compras estão divididas (por valor).
  const division = useMemo(() => {
    const pos = d.txs.filter((t) => t.amount > 0);
    const shared = sumCents(pos.filter((t) => t.split.type === "SHARED_DEFAULT" || t.split.type === "SHARED_CUSTOM"));
    const a = sumCents(pos.filter((t) => t.split.type === "INDIVIDUAL_A"));
    const b = sumCents(pos.filter((t) => t.split.type === "INDIVIDUAL_B"));
    const tot = Math.max(1, shared + a + b);
    return [
      { key: "shared", label: d.config.defaultSplitPercentA === 50 ? "Meio a meio" : "Divididas", pct: (shared / tot) * 100, cls: "bg-zinc-300 text-zinc-800" },
      { key: "a", label: `Só ${first("USER_A")}`, pct: (a / tot) * 100, cls: "text-white", bg: PERSON.USER_A.bg },
      { key: "b", label: `Só ${first("USER_B")}`, pct: (b / tot) * 100, cls: "text-emerald-950", bg: PERSON.USER_B.bg },
    ].filter((x) => x.pct > 0);
  }, [d.txs, d.config]);

  const debts = state!.recurring.data.debts;
  const offCard = d.recurringExpenses
    .map((e) => ({ e, debt: debts.find((x) => `recurring:${x.id}` === e.id) }))
    .filter((x): x is { e: (typeof d.recurringExpenses)[number]; debt: RecurringDebt } => Boolean(x.debt));
  const rules = Object.keys(d.config.merchantRules ?? {}).length;
  const lastSync = ago(d.config.pluggyLastSyncAt);

  const pickCard = (id: string) => setCardId((c) => (c === id ? null : id));
  const txs: Transaction[] = cardId ? d.txs.filter((t) => rootCardId(t.cardId, d.config.cards) === cardId) : d.txs;

  return (
    <div className="space-y-4">
      <section ref={ref} className={panel}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Faturas de {monthName(d.month).toLowerCase()}</h1>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  status === "Em aberto" ? "bg-amber-50 text-amber-700" : status === "Previsão" ? "bg-slate-100 text-zinc-600" : "bg-emerald-50 text-emerald-700",
                )}
              >
                {status}
              </span>
            </div>
            <p className="tabular mt-1 text-4xl font-extrabold tracking-tight">{fmt.money(d.total)}</p>
            <p className="mt-1 text-sm text-zinc-600">
              {real.length} compra{real.length === 1 ? "" : "s"} em {usedCards} cart{usedCards === 1 ? "ão" : "ões"}
              {d.totalDelta !== null && real.length > 0 && (
                <>
                  {" · "}
                  <b className={d.totalDelta > 0 ? "text-rose-600" : "text-emerald-600"}>
                    {d.totalDelta > 0 ? "+" : ""}
                    {Math.round(d.totalDelta)}%
                  </b>{" "}
                  que {monthName(addMonths(d.month, -1)).toLowerCase()}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {bankReady ? (
              <>
                <button className={pillBtn} disabled={bankSyncing} onClick={() => void syncBank()}>
                  {bankSyncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  {bankSyncing ? "Buscando no banco…" : "Buscar compras novas no banco"}
                </button>
                {lastSync && <p className="text-xs text-zinc-500">Atualizado {lastSync} pelo Open Finance</p>}
              </>
            ) : (
              <button className={pillBtn} onClick={() => setSheet("importar")}>
                <FileUp className="size-4" /> Trazer compras
              </button>
            )}
          </div>
        </div>

        {division.length > 0 && (
          <div className="mt-5">
            <p className="mb-1.5 text-sm text-zinc-600">Como as compras estão divididas</p>
            <div className="flex h-7 w-full overflow-hidden rounded-lg bg-zinc-100">
              {division.map((x, i) => (
                <div
                  key={x.key}
                  className={cn("flex min-w-0 items-center overflow-hidden px-2.5 text-xs font-semibold whitespace-nowrap transition-[width] duration-700 ease-out motion-reduce:transition-none", x.cls)}
                  style={{ width: shown ? `${x.pct}%` : "0%", background: x.bg, transitionDelay: `${i * 120}ms` }}
                  title={`${x.label} ${Math.round(x.pct)}%`}
                >
                  {x.pct >= 16 ? `${x.label} ${Math.round(x.pct)}%` : x.pct >= 4 ? `${Math.round(x.pct)}%` : ""}
                </div>
              ))}
            </div>
          </div>
        )}

        {cards.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-sm text-zinc-600">Por cartão, do que mais gastou para o que menos gastou (toque para ver só um)</p>
            <div ref={rowRef} {...drag} className="no-scrollbar -mx-4 flex cursor-grab snap-x gap-3 overflow-x-auto px-4 pb-1 select-none active:cursor-grabbing sm:-mx-6 sm:px-6">
              {cards.map(({ c, total }, i) => {
                const pct = (Math.max(0, total) / cardsSum) * 100;
                const active = cardId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => pickCard(c.id)}
                    aria-pressed={active}
                    className={cn(
                      "w-[200px] shrink-0 snap-start rounded-2xl border p-2 text-left transition-[opacity,transform,border-color] duration-500 ease-out motion-reduce:transition-none",
                      active ? "border-zinc-900 ring-1 ring-zinc-900" : "border-[#ebebef] hover:border-zinc-300",
                      cardId && !active && "opacity-60",
                    )}
                    style={{ opacity: shown ? undefined : 0, transform: shown ? "none" : "translateY(12px)", transitionDelay: `${i * 90}ms` }}
                  >
                    <CreditCardVisual compact card={c} ownerName={first(c.owner)} />
                    <div className="mt-2 flex items-center justify-between gap-2 px-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] font-extrabold text-white">{i + 1}º</span>
                        <span className="tabular truncate text-sm font-bold">{fmt.money(total)}</span>
                      </span>
                      <span className="tabular hidden text-xs text-zinc-500 sm:inline">{Math.round(pct)}%</span>
                    </div>
                    <div className="mx-1 mt-1.5 mb-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-[#4f52d6] transition-[width] duration-700 ease-out motion-reduce:transition-none"
                        style={{ width: shown ? `${pct}%` : "0%", transitionDelay: `${200 + i * 90}ms` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <PaidBills />

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className={cn(panel, "min-w-0")}>
          <Purchases txs={txs} closed={closed} cardName={cardId ? d.config.cards.find((c) => c.id === cardId)?.nickname : undefined} onClearCard={() => setCardId(null)} />
        </section>

        <div className="space-y-4">
          <section className={panel}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Contas fora do cartão</h2>
                <p className="text-sm text-zinc-600">Boletos, débito e Pix de {monthName(d.month).toLowerCase()}</p>
              </div>
              <button className={cn(pillBtn, "h-9 px-3.5")} onClick={() => setEditingDebt(newDebt(d.month))}>
                <Plus className="size-4" /> Conta
              </button>
            </div>
            {offCard.length === 0 ? (
              <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm text-zinc-500">Nenhuma conta neste mês. Aluguel, condomínio e boletos entram aqui.</p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-100">
                {offCard.map(({ e, debt }) => (
                  <li key={debt.id}>
                    <button onClick={() => setEditingDebt(debt)} className="flex w-full items-start justify-between gap-3 py-2.5 text-left">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{debt.description}</span>
                        <span className="block text-xs text-zinc-500">
                          {KINDS[debt.kind]} · vence dia {debt.dueDay} · {first(debt.paidBy)} paga
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="tabular block text-sm font-bold">{fmt.money(e.amount)}</span>
                        <span className="block text-[11px] text-zinc-500">{splitLabel(debt.split, d.config)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 flex items-center justify-between border-t border-zinc-100 pt-2.5 text-sm">
              <button onClick={() => setSheet("recorrentes")} className="text-zinc-600 underline underline-offset-2">
                Ver todas as contas
              </button>
              <span className="tabular font-bold">{fmt.money(sumCents(offCard.map((x) => x.e)))}</span>
            </div>
          </section>

          <section className={panel}>
            <h2 className="text-base font-bold">Trazer compras</h2>
            <div className={cn("mt-3 flex items-start gap-2 rounded-2xl p-3 text-sm", bankReady ? "bg-emerald-50 text-emerald-900" : "bg-zinc-50 text-zinc-600")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", bankReady ? "bg-emerald-500" : "bg-zinc-400")} />
              {bankReady ? (
                "Banco conectado: as compras chegam sozinhas."
              ) : (
                <span>
                  Banco ainda não conectado.{" "}
                  <Link href="/configuracoes#open-finance" className="font-semibold underline">
                    Conectar
                  </Link>
                </span>
              )}
            </div>
            <div className="mt-3 space-y-2">
              <button className={cn(pillBtn, "h-11 w-full")} onClick={() => setSheet("importar")}>
                Enviar arquivo da fatura
              </button>
              <button className={cn(pillBtn, "h-11 w-full")} disabled={closed} onClick={() => setSheet("manual")}>
                <Plus className="size-4" /> Compra feita à mão
              </button>
            </div>
          </section>

          <section className={panel}>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <BookUser className="size-4 text-zinc-500" /> Fornecedores lembrados
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              {rules
                ? `O app já conhece ${rules} fornecedor${rules === 1 ? "" : "es"}. Compra nova deles já chega com a categoria e a divisão certas.`
                : "Quando você muda a categoria ou a divisão de uma compra, o app lembra para as próximas do mesmo lugar."}
            </p>
            <Link href="/configuracoes#fornecedores" className={cn(pillBtn, "mt-3 h-10 w-full")}>
              Ver e corrigir fornecedores
            </Link>
          </section>
        </div>
      </div>

      <DebtSheet editing={editingDebt} onClose={() => setEditingDebt(null)} />
      <Sheet open={sheet === "importar"} onOpenChange={(o) => !o && setSheet(null)} title="Trazer compras" description="Pelo banco conectado ou pelo arquivo da fatura.">
        <ImportTab />
      </Sheet>
      <Sheet open={sheet === "recorrentes"} onOpenChange={(o) => !o && setSheet(null)} title="Contas e compras que se repetem">
        <RecurringTab />
      </Sheet>
      <ManualPurchaseSheet open={sheet === "manual"} onClose={() => setSheet(null)} />
    </div>
  );
}

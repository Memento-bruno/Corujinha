"use client";

import { CalendarClock, Check, CreditCard, Plus } from "lucide-react";
import { useState } from "react";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import type { Cents, RecurringDebt } from "@/lib/domain/types";
import { isDebtActiveIn } from "@/lib/engines/settlement";
import { cn } from "@/lib/utils";
import { DebtSheet, newDebt } from "../faturas/recurring-tab";

function todayBR(): { month: string; day: number } {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return { month: s.slice(0, 7), day: Number(s.slice(8, 10)) };
}

interface DueItem {
  key: string;
  day: number;
  diff: number;
  title: string;
  amount: Cents;
  paid: boolean;
  /** Pago segundo o banco (não dá para desmarcar no app). */
  bankPaid?: boolean;
  debt?: RecurringDebt;
  cardKey?: string;
}

/** Chave da marca "Já paguei" de uma fatura de cartão. */
export const cardBillKey = (cardId: string, month: string) => `${cardId}|${month}`;

/** Lembretes de vencimento do mês (água, internet, faturas dos cartões...), em ordem de data. */
export function DueDates() {
  const { state, view, updateRecurring, updateConfig } = useStore();
  const d = useDerived();
  const fmt = useFmt(d.spend.total);
  const [editing, setEditing] = useState<RecurringDebt | null>(null);
  const today = todayBR();
  const [y, m] = d.month.split("-");
  const lastDay = new Date(Number(y), Number(m), 0).getDate();
  const diffOf = (day: number) => (d.month === today.month ? day - today.day : d.month < today.month ? -99 : 99);

  const debtItems: DueItem[] = d.viewDebts
    .filter((x) => x.kind !== "CARTAO" && isDebtActiveIn(x, d.month))
    .map((x) => {
      const day = Math.min(x.dueDay, lastDay);
      return { key: x.id, day, diff: diffOf(day), title: x.description, amount: x.amount, paid: Boolean(x.paidMonths?.includes(d.month)), debt: x };
    });

  // Faturas dos cartões: vencimento e situação vêm do banco (Open Finance).
  const bills = state!.statements[d.month]?.data.bankBills ?? {};
  const marks = new Set(d.config.paidCardBills ?? []);
  const cardItems: DueItem[] = Object.entries(bills).flatMap(([cardId, b]) => {
    const card = d.config.cards.find((c) => c.id === cardId);
    if (!card || !b.dueDate || b.total <= 0 || (view !== "COUPLE" && card.owner !== view)) return [];
    const day = Number(b.dueDate.slice(8, 10));
    const sameMonth = b.dueDate.slice(0, 7) === d.month;
    const k = cardBillKey(cardId, d.month);
    const bankPaid = b.status === "paga";
    return [
      {
        key: `card-${cardId}`,
        day,
        diff: sameMonth ? diffOf(day) : b.dueDate.slice(0, 7) < today.month ? -99 : 99,
        title: `Fatura ${card.nickname}`,
        amount: b.total,
        paid: bankPaid || marks.has(k),
        bankPaid,
        cardKey: k,
      },
    ];
  });

  const items = [...debtItems, ...cardItems].sort((a, b) => Number(a.paid) - Number(b.paid) || a.day - b.day);

  const togglePaid = (it: DueItem) => {
    const on = !it.paid;
    if (it.debt) {
      const id = it.debt.id;
      void updateRecurring((r) => ({
        ...r,
        debts: r.debts.map((x) => {
          if (x.id !== id) return x;
          const set = new Set(x.paidMonths ?? []);
          if (on) set.add(d.month);
          else set.delete(d.month);
          return { ...x, paidMonths: [...set].sort().slice(-240) };
        }),
      }));
    } else if (it.cardKey) {
      const k = it.cardKey;
      void updateConfig((c) => {
        const set = new Set(c.paidCardBills ?? []);
        if (on) set.add(k);
        else set.delete(k);
        return { ...c, paidCardBills: [...set].slice(-1000) };
      });
    }
  };

  const chip = (it: DueItem) => {
    if (it.paid) return { text: it.bankPaid ? "paga (banco)" : "paga", tone: "bg-emerald-100 text-emerald-800" };
    const diff = it.diff;
    if (diff === -99) return { text: "mês passado", tone: "bg-zinc-100 text-zinc-600" };
    if (diff === 99) return { text: "próximo mês", tone: "bg-zinc-100 text-zinc-600" };
    if (diff < 0) return { text: `venceu há ${-diff} dia${diff === -1 ? "" : "s"}`, tone: "bg-red-100 text-red-800" };
    if (diff === 0) return { text: "vence hoje", tone: "bg-orange-100 text-orange-800" };
    if (diff <= 3) return { text: `em ${diff} dia${diff === 1 ? "" : "s"}`, tone: "bg-orange-100 text-orange-800" };
    return { text: `em ${diff} dias`, tone: "bg-green-100 text-green-800" };
  };

  return (
    <section aria-labelledby="due-title" className="rounded-3xl border border-[#ebebef] bg-white p-3.5 sm:p-4 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="due-title" className="flex items-center gap-2 text-[15px] font-bold">
          <CalendarClock className="size-[18px] text-[#4f52d6]" /> Próximos vencimentos
        </h2>
        <button
          type="button"
          onClick={() => setEditing({ ...newDebt(d.month), kind: "CONTA_FIXA", paidBy: state!.viewer.userId })}
          className="inline-flex h-9 items-center gap-1 rounded-full border border-zinc-300 bg-white px-3 text-sm font-semibold"
        >
          <Plus className="size-4" /> Vencimento
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">Cadastre as contas com vencimento (água, luz, internet, parcela do carro...) para ser lembrado aqui.</p>
      ) : (
        <ul className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
          {items.map((it) => {
            const c = chip(it);
            return (
              <li
                key={it.key}
                className={cn(
                  "flex min-w-[176px] shrink-0 flex-col rounded-2xl border border-zinc-200 bg-[#F4F5F7]/60",
                  it.paid && "opacity-70",
                )}
              >
                <button
                  type="button"
                  onClick={() => it.debt && setEditing(it.debt)}
                  disabled={!it.debt}
                  className="flex flex-col items-start gap-1 px-3.5 pt-2.5 text-left"
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-xs font-bold text-zinc-500">
                      {it.cardKey && <CreditCard className="size-3.5" />}
                      {String(it.day).padStart(2, "0")}/{m}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.tone}`}>{c.text}</span>
                  </span>
                  <span className={cn("max-w-[200px] truncate text-sm font-semibold", it.paid && "line-through")}>{it.title}</span>
                  <span className="tabular text-sm font-bold">{fmt.money(it.amount)}</span>
                </button>
                {!it.bankPaid && (
                  <button
                    type="button"
                    onClick={() => togglePaid(it)}
                    aria-pressed={it.paid}
                    className={cn(
                      "mx-2 mt-1.5 mb-2 inline-flex h-8 items-center justify-center gap-1 rounded-full text-xs font-bold",
                      it.paid ? "bg-white text-zinc-600" : "bg-zinc-900 text-white",
                    )}
                  >
                    <Check className="size-3.5" /> {it.paid ? "Desfazer" : "Já paguei"}
                  </button>
                )}
                {it.bankPaid && <span className="px-3.5 pt-1 pb-2.5 text-[11px] text-zinc-500">O banco já confirmou</span>}
              </li>
            );
          })}
        </ul>
      )}
      <DebtSheet editing={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

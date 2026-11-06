"use client";

import { Check, CircleCheck, CreditCard } from "lucide-react";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import { closingLabel } from "@/lib/domain/closing";
import { monthName } from "@/lib/domain/months";
import type { UserId } from "@/lib/domain/types";
import { type CardBillRow, cardBillsByOwner, isSettledStatus } from "@/lib/engines/card-bills";
import { cn } from "@/lib/utils";
import { PERSON } from "../home/colors";

const br = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

/** Faturas dos cartões do mês, separadas por dono, para marcar o que já foi pago. */
export function PaidBills() {
  const { state, view, updateConfig } = useStore();
  const d = useDerived();
  const st = state!.statements[d.month]?.data;
  const bills = cardBillsByOwner({
    month: d.month,
    cards: d.config.cards,
    transactions: st?.transactions ?? [],
    bankBills: st?.bankBills,
    marks: d.config.paidCardBills,
    closing: d.closing,
  });
  const owners: UserId[] = view === "COUPLE" ? ["USER_A", "USER_B"] : [view];
  const all = owners.flatMap((u) => bills[u].rows);
  const fmt = useFmt(all.reduce((s, x) => s + x.total, 0));
  const first = (u: UserId) => d.users[u].name.split(" ")[0];
  const pendingCount = owners.reduce((s, u) => s + bills[u].pendingCount, 0);

  const toggle = (row: CardBillRow) => {
    const on = row.status !== "paga";
    void updateConfig((c) => {
      const set = new Set(c.paidCardBills ?? []);
      if (on) set.add(row.key);
      else set.delete(row.key);
      return { ...c, paidCardBills: [...set].slice(-1000) };
    });
  };

  const chip = (r: CardBillRow) => {
    switch (r.status) {
      case "paga-banco":
        return { text: "paga (banco)", tone: "bg-emerald-100 text-emerald-800" };
      case "paga":
        return { text: "paga", tone: "bg-emerald-100 text-emerald-800" };
      case "fechada":
        return { text: "no fechamento", tone: "bg-zinc-100 text-zinc-600" };
      case "parcial":
        return { text: "paga em parte", tone: "bg-amber-100 text-amber-800" };
      default:
        return { text: "pendente", tone: "bg-red-100 text-red-800" };
    }
  };

  return (
    <section aria-labelledby="paid-bills-title" className="rounded-3xl border border-[#ebebef] bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="paid-bills-title" className="flex items-center gap-2 text-base font-bold">
          <CircleCheck className="size-[18px] text-[#4f52d6]" /> Faturas pagas de {monthName(d.month).toLowerCase()}
        </h2>
        <p className="text-sm text-zinc-600">
          {all.length === 0 ? "Nenhuma fatura neste mês" : pendingCount === 0 ? "Tudo pago 🎉" : `Falta pagar ${pendingCount} fatura${pendingCount === 1 ? "" : "s"}`}
        </p>
      </div>
      <div className={cn("mt-3 grid gap-3", owners.length > 1 && "md:grid-cols-2")}>
        {owners.map((u) => {
          const o = bills[u];
          return (
            <div key={u} className="rounded-2xl border border-zinc-200 bg-[#F4F5F7]/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <span className="size-2.5 rounded-full" style={{ background: PERSON[u].bg }} />
                  Faturas de {first(u)}
                </span>
                {o.rows.length > 0 && (
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", o.pendingCount ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800")}>
                    {o.pendingCount ? `falta ${fmt.money(o.pending)}` : "em dia"}
                  </span>
                )}
              </div>
              {o.rows.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">Sem fatura neste mês.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {o.rows.map((r) => {
                    const c = chip(r);
                    const done = isSettledStatus(r.status);
                    const canToggle = r.status !== "paga-banco" && r.status !== "fechada";
                    return (
                      <li key={r.key} className={cn("flex items-center gap-3 rounded-xl bg-white p-2.5", done && "opacity-75")}>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <CreditCard className="size-3.5 shrink-0 text-zinc-500" />
                            <span className={cn("truncate text-sm font-semibold", done && "line-through")}>{r.card.nickname}</span>
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                            <span className="tabular font-bold text-zinc-800">{fmt.money(r.total)}</span>
                            {r.dueDate && <span>vence {br(r.dueDate)}</span>}
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.tone}`}>{c.text}</span>
                          </span>
                        </span>
                        {canToggle && (
                          <button
                            type="button"
                            onClick={() => toggle(r)}
                            aria-pressed={r.status === "paga"}
                            aria-label={r.status === "paga" ? `Desfazer: fatura ${r.card.nickname} paga` : `Marcar fatura ${r.card.nickname} como paga`}
                            className={cn(
                              "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-bold",
                              r.status === "paga" ? "border border-zinc-300 bg-white text-zinc-600" : "bg-zinc-900 text-white",
                            )}
                          >
                            <Check className="size-3.5" /> {r.status === "paga" ? "Desfazer" : "Já paguei"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {d.closing && all.some((r) => r.status === "fechada") && (
        <p className="mt-2 text-xs text-zinc-500">Faturas que venceram até {closingLabel(d.closing)} ficaram no fechamento.</p>
      )}
    </section>
  );
}

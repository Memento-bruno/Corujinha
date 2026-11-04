"use client";

import { useState } from "react";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import type { RecurringDebt } from "@/lib/domain/types";
import { isDebtActiveIn } from "@/lib/engines/settlement";
import { DebtSheet, KINDS, newDebt } from "../faturas/recurring-tab";

/** Contas fixas e boletos do mês (dentro ou fora do cartão), com atalho para cadastrar uma nova. */
export function BillsCard() {
  const { state } = useStore();
  const d = useDerived();
  const fmt = useFmt(d.spend.total);
  const [editing, setEditing] = useState<RecurringDebt | null>(null);
  const debts = state!.recurring.data.debts.filter((x) => isDebtActiveIn(x, d.month)).sort((a, b) => a.dueDay - b.dueDay);
  const total = debts.reduce((s, x) => s + x.amount, 0);
  return (
    <section aria-labelledby="fix-title" className="min-w-0 flex-[1_1_340px] rounded-3xl border border-[#ebebef] bg-white p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="fix-title" className="text-base font-bold sm:text-lg">Contas fixas e boletos</h2>
          <p className="mt-1 text-sm text-zinc-600">Repetem todo mês, dentro ou fora do cartão</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(newDebt(d.month))}
          className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border border-zinc-300 bg-white px-3 text-sm font-semibold sm:h-11 sm:px-4"
        >
          + Nova conta
        </button>
      </div>
      {debts.length === 0 ? (
        <p className="mt-5 text-sm text-zinc-500">Nenhuma conta cadastrada. Aluguel, condomínio e boletos entram aqui e nos gráficos.</p>
      ) : (
        <ul className="mt-4">
          {debts.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => setEditing(x)} className="flex w-full items-center justify-between gap-3 border-b border-[#f0f0f3] py-3 text-left">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{x.description}</div>
                  <div className="text-xs text-zinc-600">
                    {KINDS[x.kind]} · vence dia {x.dueDay} · {d.users[x.paidBy].name.split(" ")[0]} paga
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabular text-sm font-bold">{fmt.money(x.amount)}</div>
                  <span className={`text-[11px] font-bold ${x.kind === "CARTAO" ? "text-[#4f52d6]" : "text-zinc-500"}`}>
                    {x.kind === "CARTAO" ? "no cartão" : "fora do cartão"}
                  </span>
                </div>
              </button>
            </li>
          ))}
          <li className="flex justify-between pt-3 text-sm">
            <span className="text-zinc-600">Total do mês</span>
            <b className="tabular">{fmt.money(total)}</b>
          </li>
        </ul>
      )}
      <DebtSheet editing={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

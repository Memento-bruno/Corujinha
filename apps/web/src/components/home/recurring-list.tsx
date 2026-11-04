"use client";

import Link from "next/link";
import { useDerived, useFmt } from "@/lib/client/derived";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { MerchantLogo } from "./merchant-logo";

export function RecurringList() {
  const d = useDerived();
  const fmt = useFmt(d.coupleTotal);
  const items = [
    ...d.subscriptions.map((t) => ({
      id: t.id,
      name: t.description,
      sub: `Assinatura · ${d.users[t.paidBy].name.split(" ")[0]}`,
      amount: t.amount,
    })),
    ...d.recurringExpenses.map((e) => ({
      id: e.id,
      name: e.description,
      sub: `Conta fixa · paga por ${d.users[e.paidBy].name.split(" ")[0]}`,
      amount: e.amount,
    })),
  ];
  return (
    <Card>
      <CardHeader
        title="Recorrentes do mês"
        subtitle="Assinaturas nos cartões e contas fixas"
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/faturas?tab=recorrentes">Gerenciar</Link>
          </Button>
        }
      />
      <ul className="space-y-2">
        {items.slice(0, 8).map((i) => (
          <li key={i.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-2.5">
            <MerchantLogo name={i.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-zinc-900">{i.name}</p>
              <p className="truncate text-xs text-zinc-500">{i.sub}</p>
            </div>
            <span className="tabular text-sm font-bold text-zinc-900">{fmt.money(i.amount)}</span>
          </li>
        ))}
      </ul>
      {items.length > 8 && <p className="mt-2 text-center text-xs text-zinc-500">+{items.length - 8} itens</p>}
    </Card>
  );
}

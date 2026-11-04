"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import type { ViewFilter } from "@/lib/engines/analytics";
import { sumCents } from "@/lib/engines/analytics";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Segmented } from "../ui/segmented";
import { CreditCardVisual } from "./credit-card";

export function CardsSection() {
  const { view, setView } = useStore();
  const d = useDerived();
  const fmt = useFmt(d.coupleTotal);
  const cards = d.config.cards.filter((c) => view === "COUPLE" || c.owner === view);
  return (
    <Card>
      <CardHeader
        title="Cartões do casal"
        subtitle="Só guardamos os 4 últimos dígitos"
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/ajustes#cartoes">
              <Plus /> Cartão
            </Link>
          </Button>
        }
      />
      <Segmented<ViewFilter>
        size="sm"
        value={view}
        onChange={setView}
        className="mb-3"
        options={[
          { value: "COUPLE", label: "Casal" },
          { value: "USER_A", label: d.users.USER_A.name.split(" ")[0] },
          { value: "USER_B", label: d.users.USER_B.name.split(" ")[0] },
        ]}
      />
      {cards.length === 0 ? (
        <p className="rounded-2xl bg-slate-50 p-4 text-sm text-zinc-500">Nenhum cartão cadastrado. Adicione em Ajustes.</p>
      ) : (
        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
          {cards.map((c) => {
            const total = sumCents(d.allTxs.filter((t) => t.cardId === c.id));
            return (
              <div key={c.id} className="w-[86%] shrink-0 snap-center sm:w-[340px]">
                <CreditCardVisual card={c} ownerName={d.users[c.owner].name.split(" ")[0]} />
                <div className="mt-2 flex items-center justify-between px-1 text-xs">
                  <span className="text-zinc-500">Fatura do mês</span>
                  <span className="tabular font-bold text-zinc-900">{fmt.money(total)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

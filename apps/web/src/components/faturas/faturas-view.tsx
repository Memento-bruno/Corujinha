"use client";

import { useEffect, useState } from "react";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import type { ViewFilter } from "@/lib/engines/analytics";
import { MonthSwitcher } from "../shell/month-switcher";
import { Card } from "../ui/card";
import { DeltaPill } from "../ui/delta-pill";
import { Segmented } from "../ui/segmented";
import { ImportTab } from "./import-tab";
import { RecurringTab } from "./recurring-tab";
import { TransactionsTab } from "./transactions-tab";

type Tab = "transacoes" | "recorrentes" | "importar";

export function FaturasView() {
  const { view, setView } = useStore();
  const d = useDerived();
  const fmt = useFmt(d.coupleTotal);
  const [tab, setTab] = useState<Tab>("transacoes");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "recorrentes" || t === "importar") setTab(t);
  }, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-base font-semibold text-zinc-900">Faturas</h2>
        <MonthSwitcher />
      </div>
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-zinc-500">{view === "COUPLE" ? "Faturas consolidadas do casal" : `Faturas de ${d.users[view].name}`}</p>
          <p className="tabular text-2xl font-bold text-zinc-900">{fmt.money(d.total)}</p>
          <DeltaPill value={d.totalDelta} className="mt-1" />
        </div>
        <Segmented<ViewFilter>
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: "COUPLE", label: "Casal" },
            { value: "USER_A", label: d.users.USER_A.name.split(" ")[0] },
            { value: "USER_B", label: d.users.USER_B.name.split(" ")[0] },
          ]}
        />
      </Card>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        className="w-full justify-between [&>button]:flex-1"
        options={[
          { value: "transacoes", label: "Transações" },
          { value: "recorrentes", label: "Boletos e fixas" },
          { value: "importar", label: "Importar" },
        ]}
      />
      {tab === "transacoes" && <TransactionsTab />}
      {tab === "recorrentes" && <RecurringTab />}
      {tab === "importar" && <ImportTab />}
    </div>
  );
}

"use client";

import { motion } from "framer-motion";
import { ArrowLeftRight, CreditCard, UserRound, UsersRound } from "lucide-react";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import { otherUser } from "@/lib/domain/types";
import { deltaPct } from "@/lib/engines/analytics";
import { Card } from "../ui/card";
import { DeltaPill } from "../ui/delta-pill";
import { IconBox } from "../ui/icon-box";

export function KpiGrid() {
  const { state } = useStore();
  const d = useDerived();
  const fmt = useFmt(d.coupleTotal);
  const me = state!.viewer.userId;
  const other = otherUser(me);
  const t = d.settlement.transfer;
  const pt = d.prevSettlement.transfer;
  // Saldo do acerto do ponto de vista de quem está vendo: positivo = tenho a receber
  const signed = (x: typeof t) => (!x ? 0 : x.to === me ? x.amount : -x.amount);
  const net = signed(t);
  const prevNet = signed(pt);

  const items = [
    {
      key: "total",
      icon: <CreditCard />,
      label: "Fatura consolidada",
      value: fmt.money(d.coupleTotal),
      delta: deltaPct(d.coupleTotal, d.byMonth[d.prevMonth]?.reduce((s, x) => s + x.amount, 0) ?? 0),
    },
    {
      key: "mine",
      icon: <UserRound />,
      label: "Minha parte",
      value: fmt.money(d.shares[me]),
      delta: deltaPct(d.shares[me], d.prevShares[me]),
    },
    {
      key: "partner",
      icon: <UsersRound />,
      label: `Parte de ${d.users[other].name.split(" ")[0]}`,
      value: fmt.money(d.shares[other]),
      delta: deltaPct(d.shares[other], d.prevShares[other]),
    },
    {
      key: "net",
      icon: <ArrowLeftRight />,
      label: "Acerto líquido",
      value: net === 0 ? (fmt.privacy ? "0%" : fmt.money(0)) : fmt.money(Math.abs(net)),
      hint: net === 0 ? "Tudo certo" : net > 0 ? "a receber" : "a pagar",
      hintTone: net >= 0 ? "text-emerald-600" : "text-rose-600",
      delta: deltaPct(Math.abs(net), Math.abs(prevNet)),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it, i) => (
        <motion.div key={it.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
          <Card className="h-full rounded-2xl p-3.5 sm:p-4">
            <div className="flex items-center gap-2">
              <IconBox className="rounded-full">{it.icon}</IconBox>
              <span className="truncate text-xs font-medium text-zinc-500">{it.label}</span>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="tabular text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">{it.value}</span>
              {it.hint && <span className={`text-[11px] font-semibold ${it.hintTone}`}>{it.hint}</span>}
            </div>
            <DeltaPill value={it.delta} className="mt-1.5" suffix="mês anterior" />
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

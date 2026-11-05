"use client";

import { Repeat, X } from "lucide-react";
import { useDerived } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import type { HouseholdConfig } from "@/lib/domain/types";
import { SUBSCRIPTION_TAG } from "@/lib/engines/analytics";
import { Card, CardHeader } from "../ui/card";
import { IconBox } from "../ui/icon-box";

/** Lojas que o casal marcou como assinatura (alertas de cobrança repetida e aumento de preço). */
export function SubscriptionsCard({ cfg, set }: { cfg: HouseholdConfig; set: (fn: (c: HouseholdConfig) => HouseholdConfig) => void }) {
  const { updateStatement } = useStore();
  const d = useDerived();
  const name = (k: string) => cfg.merchantRules?.[k]?.name ?? d.allTxs.find((t) => t.merchantKey === k)?.description ?? k;
  const remove = (k: string) => {
    set((c) => ({ ...c, subscriptionMerchants: c.subscriptionMerchants.filter((x) => x !== k) }));
    if (!d.snapshot)
      void updateStatement(d.month, (s) => ({
        ...s,
        transactions: s.transactions.map((t) => (t.merchantKey === k ? { ...t, tags: t.tags.filter((g) => g !== SUBSCRIPTION_TAG) } : t)),
      }));
  };
  return (
    <Card id="assinaturas">
      <CardHeader icon={<IconBox><Repeat /></IconBox>} title="Assinaturas" subtitle="Avisam de cobrança repetida e aumento de preço" />
      {cfg.subscriptionMerchants.length === 0 ? (
        <p className="rounded-2xl bg-zinc-50 p-3 text-sm text-zinc-500">Nenhuma ainda. Em Faturas, abra uma compra e ligue “Assinatura”.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {cfg.subscriptionMerchants.map((k) => (
            <span key={k} className="inline-flex h-9 items-center gap-1 rounded-full border border-zinc-200 bg-white pr-1 pl-3.5 text-sm font-medium">
              {name(k)}
              <button onClick={() => remove(k)} className="rounded-full p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Tirar ${name(k)} das assinaturas`}>
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

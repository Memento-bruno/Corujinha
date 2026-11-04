"use client";

import { Lock, Repeat, Search, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/domain/categories";
import type { CategoryId, Transaction } from "@/lib/domain/types";
import { SUBSCRIPTION_TAG, isSubscription } from "@/lib/engines/analytics";
import { splitAmount } from "@/lib/engines/settlement";
import { MerchantLogo } from "../home/merchant-logo";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Label, Select, inputClass } from "../ui/field";
import { Segmented } from "../ui/segmented";
import { Sheet } from "../ui/sheet";
import { Switch } from "../ui/switch";
import { SplitBadge } from "./split-badge";
import { SplitEditor } from "./split-editor";

type Filter = "all" | "shared" | "individual" | "subs";

const DAY = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", weekday: "short", timeZone: "UTC" });

export function TransactionsTab() {
  const { updateStatement, updateConfig, toast } = useStore();
  const d = useDerived();
  const fmt = useFmt(d.coupleTotal);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const closed = Boolean(d.snapshot);
  const cards = Object.fromEntries(d.config.cards.map((c) => [c.id, c]));

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return d.txs.filter((t) => {
      if (needle && !t.description.toLowerCase().includes(needle) && !CATEGORIES[t.category].label.toLowerCase().includes(needle)) return false;
      if (filter === "shared") return t.split.type === "SHARED_DEFAULT" || t.split.type === "SHARED_CUSTOM";
      if (filter === "individual") return t.split.type === "INDIVIDUAL_A" || t.split.type === "INDIVIDUAL_B";
      if (filter === "subs") return isSubscription(t, d.config);
      return true;
    });
  }, [d.txs, d.config, q, filter]);

  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of [...list].sort((a, b) => b.date.localeCompare(a.date))) m.set(t.date, [...(m.get(t.date) ?? []), t]);
    return [...m.entries()];
  }, [list]);

  const patch = (id: string, fn: (t: Transaction) => Transaction | null) => {
    void updateStatement(d.month, (s) => ({
      ...s,
      transactions: s.transactions.flatMap((t) => {
        if (t.id !== id) return [t];
        const n = fn(t);
        return n ? [n] : [];
      }),
    }));
  };

  const markSubscriptions = (keys: string[]) => {
    void updateConfig((c) => ({ ...c, subscriptionMerchants: [...new Set([...c.subscriptionMerchants, ...keys])] }));
    void updateStatement(d.month, (s) => ({
      ...s,
      transactions: s.transactions.map((t) =>
        keys.includes(t.merchantKey) && !t.tags.includes(SUBSCRIPTION_TAG) ? { ...t, tags: [...t.tags, SUBSCRIPTION_TAG] } : t,
      ),
    }));
    toast("Marcado como assinatura.", "success");
  };

  return (
    <div className="space-y-3">
      {closed && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <Lock className="size-4" /> Mês fechado: as transações estão travadas. Reabra o mês na aba Acerto para editar.
        </div>
      )}
      {d.suggestedSubscriptions.length > 0 && !closed && (
        <Card className="flex flex-col gap-3 rounded-2xl border-brand-100 bg-brand-50/60 p-3.5 sm:flex-row sm:items-center">
          <Sparkles className="size-5 shrink-0 text-brand-600" />
          <p className="flex-1 text-sm text-zinc-700">
            <b>Regra de repetição mensal:</b> {d.suggestedSubscriptions.map((k) => d.allTxs.find((t) => t.merchantKey === k)?.description ?? k).join(", ")}{" "}
            {d.suggestedSubscriptions.length > 1 ? "aparecem" : "aparece"} todo mês com o mesmo valor. Marcar como assinatura?
          </p>
          <Button size="sm" onClick={() => markSubscriptions(d.suggestedSubscriptions)}>
            <Repeat /> Marcar
          </Button>
        </Card>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-zinc-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar estabelecimento ou setor" className={inputClass + " pl-10"} />
        </label>
        <Segmented<Filter>
          size="sm"
          value={filter}
          onChange={setFilter}
          className="self-start"
          options={[
            { value: "all", label: "Todas" },
            { value: "shared", label: "Divididas" },
            { value: "individual", label: "Individuais" },
            { value: "subs", label: "Assinaturas" },
          ]}
        />
      </div>
      <div className="flex items-center justify-between px-1 text-xs text-zinc-500">
        <span>{list.length} transações</span>
        <span className="tabular font-semibold text-zinc-700">{fmt.money(list.reduce((s, t) => s + t.amount, 0))}</span>
      </div>

      {groups.length === 0 && <Card className="text-center text-sm text-zinc-500">Nenhuma transação. Importe uma fatura na aba Importar.</Card>}

      {groups.map(([date, txs]) => (
        <Card key={date} className="rounded-2xl p-2 sm:p-2">
          <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">{DAY.format(new Date(`${date}T12:00:00Z`))}</p>
          <ul>
            {txs.map((t) => {
              const card = cards[t.cardId];
              return (
                <li key={t.id}>
                  <button
                    onClick={() => setEditing(t)}
                    className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-slate-50"
                  >
                    <MerchantLogo name={t.description} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-zinc-900">
                        <span className="truncate">{t.description}</span>
                        {t.installment && (
                          <span className="tabular shrink-0 rounded-md bg-slate-100 px-1.5 text-[10px] font-bold text-zinc-600">
                            {String(t.installment.current).padStart(2, "0")}/{String(t.installment.total).padStart(2, "0")}
                          </span>
                        )}
                        {isSubscription(t, d.config) && <Repeat className="size-3 shrink-0 text-brand-500" aria-label="Assinatura" />}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {CATEGORIES[t.category].label} · {card ? `${card.nickname} •${card.last4}` : "Cartão"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={"tabular text-sm font-bold " + (t.amount < 0 ? "text-emerald-600" : "text-zinc-900")}>
                        {fmt.money(t.amount)}
                      </span>
                      <SplitBadge split={t.split} cfg={d.config} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.description ?? ""} description="Defina como esta compra entra no encontro de contas.">
        {editing && (
          <TransactionEditor
            tx={editing}
            readOnly={closed}
            onChange={(n) => {
              setEditing(n);
              patch(n.id, () => n);
            }}
            onDelete={() => {
              patch(editing.id, () => null);
              setEditing(null);
              toast("Transação removida.");
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function TransactionEditor({
  tx,
  onChange,
  onDelete,
  readOnly,
}: {
  tx: Transaction;
  onChange: (t: Transaction) => void;
  onDelete: () => void;
  readOnly: boolean;
}) {
  const d = useDerived();
  const fmt = useFmt(d.coupleTotal);
  const { shareA, shareB } = splitAmount(tx.amount, tx.split, d.config.defaultSplitPercentA);
  const sub = tx.tags.includes(SUBSCRIPTION_TAG);
  const owner = d.users[tx.paidBy].name.split(" ")[0];
  return (
    <fieldset disabled={readOnly} className="space-y-5 disabled:opacity-60">
      <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
        <div>
          <p className="text-xs text-zinc-500">Valor · fatura de {owner}</p>
          <p className="tabular text-xl font-bold text-zinc-900">{fmt.money(tx.amount)}</p>
        </div>
        <div className="text-right text-xs">
          <p className="tabular text-brand-600">
            {d.users.USER_A.name.split(" ")[0]}: <b>{fmt.money(shareA)}</b>
          </p>
          <p className="tabular text-emerald-600">
            {d.users.USER_B.name.split(" ")[0]}: <b>{fmt.money(shareB)}</b>
          </p>
        </div>
      </div>
      <div>
        <Label>Divisão</Label>
        <SplitEditor value={tx.split} cfg={d.config} onChange={(split) => onChange({ ...tx, split })} />
      </div>
      <div>
        <Label>Setor</Label>
        <Select value={tx.category} onChange={(e) => onChange({ ...tx, category: e.target.value as CategoryId })}>
          {CATEGORY_IDS.map((c) => (
            <option key={c} value={c}>
              {CATEGORIES[c].label}
            </option>
          ))}
        </Select>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3">
        <span>
          <span className="block text-sm font-semibold text-zinc-900">Assinatura</span>
          <span className="block text-xs text-zinc-500">Entra nos alertas de duplicidade e aumento de preço</span>
        </span>
        <Switch
          checked={sub}
          onCheckedChange={(v) => onChange({ ...tx, tags: v ? [...tx.tags, SUBSCRIPTION_TAG] : tx.tags.filter((x) => x !== SUBSCRIPTION_TAG) })}
        />
      </label>
      <Button variant="danger" className="w-full" onClick={onDelete} type="button">
        <Trash2 /> Remover transação
      </Button>
    </fieldset>
  );
}

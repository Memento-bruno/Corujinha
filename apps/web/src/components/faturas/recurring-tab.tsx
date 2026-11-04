"use client";

import { EyeOff, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/domain/categories";
import { formatBRL, parseMoneyToCents } from "@/lib/domain/money";
import { monthDiff, monthLabel } from "@/lib/domain/months";
import type { CategoryId, RecurringDebt, RecurringKind, UserId } from "@/lib/domain/types";
import { isDebtActiveIn } from "@/lib/engines/settlement";
import { MerchantLogo } from "../home/merchant-logo";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input, Label, Select } from "../ui/field";
import { Sheet } from "../ui/sheet";
import { Switch } from "../ui/switch";
import { SplitBadge } from "./split-badge";
import { SplitEditor } from "./split-editor";

const KINDS: Record<RecurringKind, string> = {
  CONTA_FIXA: "Conta fixa",
  FINANCIAMENTO: "Financiamento",
  PARCELAMENTO: "Parcelamento",
  ASSINATURA: "Assinatura (fora do cartão)",
};

function newDebt(month: string): RecurringDebt {
  return {
    id: `rec-${Date.now().toString(36)}`,
    description: "",
    kind: "CONTA_FIXA",
    amount: 0,
    paidBy: "USER_A",
    split: { type: "SHARED_DEFAULT" },
    category: "moradia",
    dueDay: 10,
    startMonth: month,
    active: true,
  };
}

export function RecurringTab() {
  const { state, updateRecurring, toast } = useStore();
  const d = useDerived();
  const fmt = useFmt(d.coupleTotal);
  const [editing, setEditing] = useState<RecurringDebt | null>(null);
  const debts = state!.recurring.data.debts;
  const totalActive = d.recurringExpenses.reduce((s, e) => s + e.amount, 0);

  const save = (debt: RecurringDebt) => {
    void updateRecurring((r) => {
      const exists = r.debts.some((x) => x.id === debt.id);
      return { ...r, debts: exists ? r.debts.map((x) => (x.id === debt.id ? debt : x)) : [...r.debts, debt] };
    });
    setEditing(null);
    toast("Recorrente salva.", "success");
  };

  return (
    <div className="space-y-3">
      <Card className="flex items-center justify-between rounded-2xl">
        <div>
          <p className="text-xs text-zinc-500">Recorrentes ativas em {monthLabel(d.month)}</p>
          <p className="tabular text-xl font-bold text-zinc-900">{fmt.money(totalActive)}</p>
          <p className="text-[11px] text-zinc-400">Contas pagas fora do cartão (boleto, débito, transferência)</p>
        </div>
        <Button onClick={() => setEditing(newDebt(d.month))}>
          <Plus /> Nova
        </Button>
      </Card>
      <ul className="space-y-2">
        {debts.map((debt) => {
          const active = isDebtActiveIn(debt, d.month);
          const n = monthDiff(debt.startMonth, d.month) + 1;
          return (
            <li key={debt.id}>
              <button onClick={() => setEditing(debt)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-left shadow-soft">
                <MerchantLogo name={debt.description} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900">{debt.description}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {KINDS[debt.kind]} · vence dia {debt.dueDay} · paga por {d.users[debt.paidBy].name.split(" ")[0]}
                    {debt.totalInstallments ? ` · ${Math.max(0, Math.min(n, debt.totalInstallments))}/${debt.totalInstallments}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={"tabular text-sm font-bold " + (active ? "text-zinc-900" : "text-zinc-400 line-through")}>{fmt.money(debt.amount)}</span>
                  <SplitBadge split={debt.split} cfg={d.config} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <Sheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing && debts.some((x) => x.id === editing.id) ? "Editar recorrente" : "Nova recorrente"}
        description="Dívidas fixas, financiamentos e parcelamentos pagos fora do cartão."
      >
        {editing && (
          <DebtForm
            initial={editing}
            onSave={save}
            onDelete={() => {
              void updateRecurring((r) => ({ ...r, debts: r.debts.filter((x) => x.id !== editing.id) }));
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function DebtForm({ initial, onSave, onDelete }: { initial: RecurringDebt; onSave: (d: RecurringDebt) => void; onDelete: () => void }) {
  const { privacy } = useStore();
  const d = useDerived();
  const [debt, setDebt] = useState(initial);
  const [amountText, setAmountText] = useState(initial.amount ? formatBRL(initial.amount) : "");
  const amount = parseMoneyToCents(amountText);
  const valid = debt.description.trim().length > 0 && amount !== null && amount > 0;
  const set = <K extends keyof RecurringDebt>(k: K, v: RecurringDebt[K]) => setDebt((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ ...debt, description: debt.description.trim(), amount: amount! });
      }}
    >
      <label className="block">
        <Label>Descrição</Label>
        <Input value={debt.description} onChange={(e) => set("description", e.target.value)} placeholder="Ex.: Aluguel" maxLength={140} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <Label>Valor mensal</Label>
          {privacy ? (
            <div className="flex h-11 items-center gap-2 rounded-2xl border border-dashed border-slate-200 px-3 text-xs text-zinc-500">
              <EyeOff className="size-4" /> Oculto no modo %
            </div>
          ) : (
            <Input inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="R$ 0,00" />
          )}
        </label>
        <label className="block">
          <Label>Tipo</Label>
          <Select value={debt.kind} onChange={(e) => set("kind", e.target.value as RecurringKind)}>
            {Object.entries(KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <Label>Quem paga</Label>
          <Select value={debt.paidBy} onChange={(e) => set("paidBy", e.target.value as UserId)}>
            <option value="USER_A">{d.users.USER_A.name}</option>
            <option value="USER_B">{d.users.USER_B.name}</option>
          </Select>
        </label>
        <label className="block">
          <Label>Setor</Label>
          <Select value={debt.category} onChange={(e) => set("category", e.target.value as CategoryId)}>
            {CATEGORY_IDS.map((c) => (
              <option key={c} value={c}>
                {CATEGORIES[c].label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <Label>Dia do vencimento</Label>
          <Input type="number" min={1} max={31} value={debt.dueDay} onChange={(e) => set("dueDay", Math.min(31, Math.max(1, Number(e.target.value) || 1)))} />
        </label>
        <label className="block">
          <Label>Começa em</Label>
          <Input type="month" value={debt.startMonth} onChange={(e) => e.target.value && set("startMonth", e.target.value)} />
        </label>
        <label className="col-span-2 block">
          <Label>Nº de parcelas (vazio = sem fim)</Label>
          <Input
            type="number"
            min={1}
            max={600}
            value={debt.totalInstallments ?? ""}
            onChange={(e) => set("totalInstallments", e.target.value ? Math.max(1, Number(e.target.value)) : undefined)}
          />
        </label>
      </div>
      <div>
        <Label>Divisão</Label>
        <SplitEditor value={debt.split} cfg={d.config} onChange={(s) => set("split", s)} />
      </div>
      <label className="flex items-center justify-between rounded-2xl border border-slate-200 p-3">
        <span className="text-sm font-semibold text-zinc-900">Ativa</span>
        <Switch checked={debt.active} onCheckedChange={(v) => set("active", v)} />
      </label>
      <div className="flex gap-2">
        <Button type="button" variant="danger" onClick={onDelete}>
          <Trash2 />
        </Button>
        <Button type="submit" className="flex-1" disabled={!valid}>
          Salvar
        </Button>
      </div>
      {privacy && <p className="text-center text-xs text-zinc-500">Desative o modo % para editar valores.</p>}
    </form>
  );
}

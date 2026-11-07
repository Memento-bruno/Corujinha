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

export const KINDS: Record<RecurringKind, string> = {
  BOLETO: "Boleto",
  CONTA_FIXA: "Conta fixa (débito, Pix...)",
  FINANCIAMENTO: "Financiamento",
  PARCELAMENTO: "Parcelamento",
  ASSINATURA: "Assinatura (fora do cartão)",
  CARTAO: "Compra no cartão que se repete",
};

type Frequency = "monthly" | "once" | "installments";

function frequencyOf(debt: RecurringDebt): Frequency {
  if (!debt.totalInstallments) return "monthly";
  return debt.totalInstallments === 1 ? "once" : "installments";
}

export function newDebt(month: string): RecurringDebt {
  return {
    id: `rec-${Date.now().toString(36)}`,
    description: "",
    kind: "BOLETO",
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
  const { state } = useStore();
  const d = useDerived();
  const fmt = useFmt(d.coupleTotal);
  const [editing, setEditing] = useState<RecurringDebt | null>(null);
  const debts = state!.recurring.data.debts;
  const totalActive = d.recurringExpenses.reduce((s, e) => s + e.amount, 0);
  const offCard = debts.filter((x) => x.kind !== "CARTAO");
  const onCard = debts.filter((x) => x.kind === "CARTAO");
  const cards = Object.fromEntries(d.config.cards.map((c) => [c.id, c]));

  const row = (debt: RecurringDebt) => {
    const active = isDebtActiveIn(debt, d.month);
    const n = monthDiff(debt.startMonth, d.month) + 1;
    const card = debt.cardId ? cards[debt.cardId] : undefined;
    const when =
      debt.kind === "CARTAO"
        ? `${card ? `${card.nickname} •${card.last4}` : "Cartão"} · todo mês`
        : debt.totalInstallments === 1
          ? `${KINDS[debt.kind]} · só ${monthLabel(debt.startMonth)} · vence dia ${debt.dueDay}`
          : `${KINDS[debt.kind]} · vence dia ${debt.dueDay}`;
    return (
      <li key={debt.id}>
        <button
          onClick={() => setEditing(debt)}
          className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-left shadow-soft"
        >
          <MerchantLogo name={debt.description} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-900">{debt.description}</p>
            <p className="truncate text-xs text-zinc-500">
              {when} · paga por {d.users[debt.paidBy].name.split(" ")[0]}
              {debt.totalInstallments && debt.totalInstallments > 1
                ? ` · ${Math.max(0, Math.min(n, debt.totalInstallments))}/${debt.totalInstallments}`
                : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={"tabular text-sm font-bold " + (active ? "text-zinc-900" : "text-zinc-400 line-through")}>{fmt.money(debt.amount)}</span>
            <SplitBadge split={debt.split} cfg={d.config} />
          </div>
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <Card className="flex items-center justify-between gap-3 rounded-2xl">
        <div>
          <p className="text-xs text-zinc-500">Contas fora do cartão em {monthLabel(d.month)}</p>
          <p className="tabular text-xl font-bold text-zinc-900">{fmt.money(totalActive)}</p>
          <p className="text-[11px] text-zinc-400">Boletos, débitos e transferências. Entram no acerto do casal.</p>
        </div>
        <Button onClick={() => setEditing(newDebt(d.month))}>
          <Plus /> Nova conta
        </Button>
      </Card>
      {offCard.length === 0 && (
        <Card className="text-center text-sm text-zinc-500">Nenhuma conta cadastrada. Toque em “Nova conta” para adicionar um boleto.</Card>
      )}
      <ul className="space-y-2">{offCard.map(row)}</ul>
      {onCard.length > 0 && (
        <>
          <p className="px-1 pt-2 text-xs font-semibold text-zinc-500">Compras no cartão que se repetem</p>
          <p className="px-1 text-[11px] text-zinc-400">Aparecem como “prevista” na fatura até o banco trazer a compra do mês.</p>
          <ul className="space-y-2">{onCard.map(row)}</ul>
        </>
      )}
      <DebtSheet editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/** Formulário de conta (boleto, fixa, compra recorrente no cartão) num sheet. Salva e apaga sozinho. */
export function DebtSheet({ editing: asked, onClose }: { editing: RecurringDebt | null; onClose: () => void }) {
  const { state, updateRecurring, toast } = useStore();
  const debts = state!.recurring.data.debts;
  // Sempre edita a conta como está gravada. As telas do Início mostram uma cópia ajustada ao
  // fechamento por data (começo e parcelas recalculados só para as contas): salvar essa cópia
  // estragaria o cadastro.
  const editing = asked ? (debts.find((x) => x.id === asked.id) ?? asked) : null;
  const isNew = !!editing && !debts.some((x) => x.id === editing.id);
  const save = (debt: RecurringDebt) => {
    void updateRecurring((r) => {
      const exists = r.debts.some((x) => x.id === debt.id);
      return {
        ...r,
        debts: exists ? r.debts.map((x) => (x.id === debt.id ? debt : x)) : [...r.debts, debt],
      };
    }).then((ok) => ok && toast("Conta salva.", "success"));
    onClose();
  };
  return (
    <Sheet
      open={!!editing}
      onOpenChange={(o) => !o && onClose()}
      title={editing?.kind === "CARTAO" ? "Compra que se repete" : isNew ? "Nova conta" : "Editar conta"}
      description={
        editing?.kind === "CARTAO"
          ? "Aparece prevista nas próximas faturas até o banco trazer a compra."
          : "Contas pagas fora do cartão, como boletos. Entram no acerto do casal."
      }
    >
      {editing && (
        <DebtForm
          key={editing.id}
          initial={editing}
          onSave={save}
          onDelete={() => {
            if (!isNew && !window.confirm(`Apagar a conta "${editing.description}"? Ela some de todos os meses.`)) return;
            void updateRecurring((r) => ({
              ...r,
              debts: r.debts.filter((x) => x.id !== editing.id),
            }));
            onClose();
            toast(isNew ? "Cancelado." : "Conta apagada.");
          }}
        />
      )}
    </Sheet>
  );
}

function DebtForm({ initial, onSave, onDelete }: { initial: RecurringDebt; onSave: (d: RecurringDebt) => void; onDelete: () => void }) {
  const { privacy: hidden, fake } = useStore();
  // Com valores escondidos ou fictícios, o valor não pode ser editado (o da tela não é o real).
  const privacy = hidden || fake;
  const d = useDerived();
  const [debt, setDebt] = useState(initial);
  const [amountText, setAmountText] = useState(initial.amount ? formatBRL(initial.amount) : "");
  const amount = parseMoneyToCents(amountText);
  const valid = debt.description.trim().length > 0 && amount !== null && amount > 0;
  const set = <K extends keyof RecurringDebt>(k: K, v: RecurringDebt[K]) => setDebt((x) => ({ ...x, [k]: v }));
  const isCard = debt.kind === "CARTAO";
  const frequency = frequencyOf(debt);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid)
          onSave({
            ...debt,
            description: debt.description.trim(),
            amount: amount!,
          });
      }}
    >
      <label className="block">
        <Label>Descrição</Label>
        <Input
          value={debt.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Ex.: Condomínio, escola, IPVA"
          maxLength={140}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <Label>Valor</Label>
          {privacy ? (
            <div className="flex h-11 items-center gap-2 rounded-2xl border border-dashed border-slate-200 px-3 text-xs text-zinc-500">
              <EyeOff className="size-4" /> {fake ? "Valor fictício" : "Oculto no modo %"}
            </div>
          ) : (
            <Input inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="R$ 0,00" />
          )}
        </label>
        <label className="block">
          <Label>Tipo</Label>
          <Select value={debt.kind} disabled={isCard} onChange={(e) => set("kind", e.target.value as RecurringKind)}>
            {Object.entries(KINDS)
              .filter(([k]) => isCard || k !== "CARTAO")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </Select>
        </label>
        <label className="block">
          <Label>Quem paga</Label>
          <Select value={debt.paidBy} disabled={isCard} onChange={(e) => set("paidBy", e.target.value as UserId)}>
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
        {!isCard && (
          <label className="block">
            <Label>Dia do vencimento</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={debt.dueDay}
              onChange={(e) => set("dueDay", Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
            />
          </label>
        )}
        <label className="block">
          <Label>{frequency === "once" ? "Mês da conta" : "Começa em"}</Label>
          <Input type="month" value={debt.startMonth} onChange={(e) => e.target.value && set("startMonth", e.target.value)} />
        </label>
        {!isCard && (
          <label className="col-span-2 block">
            <Label>Repete?</Label>
            <Select
              value={frequency}
              onChange={(e) => {
                const f = e.target.value as Frequency;
                set("totalInstallments", f === "monthly" ? undefined : f === "once" ? 1 : Math.max(2, debt.totalInstallments ?? 12));
              }}
            >
              <option value="monthly">Todo mês, sem data para acabar</option>
              <option value="once">Só uma vez (só neste mês)</option>
              <option value="installments">Por um número de meses (parcelas)</option>
            </Select>
          </label>
        )}
        {frequency === "installments" && (
          <label className="col-span-2 block">
            <Label>Quantos meses (parcelas)</Label>
            <Input
              type="number"
              min={2}
              max={600}
              value={debt.totalInstallments ?? ""}
              onChange={(e) => set("totalInstallments", Math.min(600, Math.max(2, Number(e.target.value) || 2)))}
            />
          </label>
        )}
      </div>
      <div>
        <Label>Divisão</Label>
        <SplitEditor value={debt.split} cfg={d.config} onChange={(s) => set("split", s)} />
      </div>
      <label className="flex items-center justify-between rounded-2xl border border-slate-200 p-3">
        <span className="text-sm font-semibold text-zinc-900">Ativa (desligue para pausar sem apagar)</span>
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
      {privacy && (
        <p className="text-center text-xs text-zinc-500">
          {fake ? "Desligue os valores fictícios (em Ajustes) para editar valores." : "Desative o modo % para editar valores."}
        </p>
      )}
    </form>
  );
}

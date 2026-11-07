"use client";

import { useState } from "react";
import { closingLabel } from "@/lib/domain/closing";
import { useDerived } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import { parseMoneyToCents } from "@/lib/domain/money";
import { addDays, addMonths, monthLabel, todayBR } from "@/lib/domain/months";
import { ownerSplit, type Transaction } from "@/lib/domain/types";
import { SUBSCRIPTION_TAG } from "@/lib/engines/analytics";
import { applyMerchantRule } from "@/lib/engines/merchants";
import { guessCategory, merchantKeyOf } from "@/lib/importers/normalize";
import { Button } from "../ui/button";
import { Input, Label, Select } from "../ui/field";
import { Sheet } from "../ui/sheet";

/** Compra que o banco não trouxe (ou cartão sem conexão). Já chega com o que o app lembra do fornecedor. */
export function ManualPurchaseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, updateStatement, toast, fake } = useStore();
  const d = useDerived();
  const [desc, setDesc] = useState("");
  const [value, setValue] = useState("");
  // Data de hoje no horário de Brasília (à noite, o relógio UTC já estaria no dia seguinte).
  const [date, setDate] = useState(() => todayBR());
  const [cardId, setCardId] = useState(d.config.cards[0]?.id ?? "");
  const [chosenBill, setChosenBill] = useState<string | null>(null);
  // Fatura: a do mês da compra ou a seguinte (compra feita depois do fechamento do cartão).
  const dateMonth = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : d.month;
  const billOptions = [dateMonth, addMonths(dateMonth, 1)];
  const bill = chosenBill && billOptions.includes(chosenBill) ? chosenBill : billOptions.includes(d.month) ? d.month : dateMonth;

  const save = () => {
    const amount = parseMoneyToCents(value);
    const card = d.config.cards.find((c) => c.id === cardId);
    if (!desc.trim() || !amount || !card) {
      toast("Preencha o nome, o valor e o cartão.", "error");
      return;
    }
    if (d.closing && date <= d.closing.date) {
      toast(`Até ${closingLabel(d.closing)} está tudo fechado. Escolha uma data depois disso.`, "error");
      return;
    }
    if (fake) {
      toast("Valores fictícios ligados: desligue em Ajustes para lançar compras.", "error");
      return;
    }
    const file = state!.statements[bill]?.data;
    if (!file) {
      toast(`Abra a fatura de ${monthLabel(bill)} no topo e tente de novo.`, "error");
      return;
    }
    if (file.snapshot) {
      toast(`O acerto de ${monthLabel(bill)} já foi fechado. Reabra o mês em Acerto para lançar.`, "error");
      return;
    }
    const merchantKey = merchantKeyOf(desc);
    const category = guessCategory(desc, merchantKey);
    const base: Transaction = {
      id: `man-${Date.now().toString(36)}`,
      date,
      description: desc.trim().slice(0, 140),
      merchantKey,
      amount,
      cardId: card.id,
      paidBy: card.owner,
      category,
      tags: d.config.subscriptionMerchants.includes(merchantKey) ? [SUBSCRIPTION_TAG] : [],
      split: ownerSplit(card.owner),
      source: "manual",
    };
    const remembered = applyMerchantRule(d.config.merchantRules, base);
    // A divisão escolhida no cartão (em Configurações) vale mais que a lembrada da loja, como nas compras do banco.
    const tx = card.defaultSplit ? { ...remembered, split: card.defaultSplit } : remembered;
    void updateStatement(bill, (s) => ({ ...s, transactions: [...s.transactions, tx].sort((a, b) => a.date.localeCompare(b.date)) }));
    const where = bill === d.month ? "" : ` Entrou na fatura de ${monthLabel(bill)}.`;
    toast((d.config.merchantRules?.[merchantKey] ? "Compra salva com a categoria e a divisão que o app lembrou." : "Compra salva.") + where, "success");
    setDesc("");
    setValue("");
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Compra feita à mão" description="Entra na fatura do cartão escolhido, no mês que você marcar.">
      <div className="space-y-4">
        <label className="block">
          <Label>Onde foi</Label>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Drogasil" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>Valor</Label>
            <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" />
          </label>
          <label className="block">
            <Label>Data</Label>
            <Input type="date" value={date} min={d.closing ? addDays(d.closing.date, 1) : undefined} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <Label>Em qual fatura</Label>
          <Select value={bill} onChange={(e) => setChosenBill(e.target.value)}>
            {billOptions.map((m) => (
              <option key={m} value={m}>
                Fatura de {monthLabel(m)}
                {m === addMonths(dateMonth, 1) ? " (a seguinte)" : ""}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <Label>Cartão</Label>
          <Select value={cardId} onChange={(e) => setCardId(e.target.value)}>
            {d.config.cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nickname} •{c.last4} · {d.users[c.owner].name.split(" ")[0]}
              </option>
            ))}
          </Select>
        </label>
        <Button className="w-full" onClick={save}>
          Salvar compra
        </Button>
      </div>
    </Sheet>
  );
}


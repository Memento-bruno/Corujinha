"use client";

import { useState } from "react";
import { useDerived } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import { parseMoneyToCents } from "@/lib/domain/money";
import { ownerSplit, type Transaction } from "@/lib/domain/types";
import { SUBSCRIPTION_TAG } from "@/lib/engines/analytics";
import { applyMerchantRule } from "@/lib/engines/merchants";
import { guessCategory, merchantKeyOf } from "@/lib/importers/normalize";
import { Button } from "../ui/button";
import { Input, Label, Select } from "../ui/field";
import { Sheet } from "../ui/sheet";

/** Compra que o banco não trouxe (ou cartão sem conexão). Já chega com o que o app lembra do fornecedor. */
export function ManualPurchaseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { updateStatement, toast } = useStore();
  const d = useDerived();
  const [desc, setDesc] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cardId, setCardId] = useState(d.config.cards[0]?.id ?? "");

  const save = () => {
    const amount = parseMoneyToCents(value);
    const card = d.config.cards.find((c) => c.id === cardId);
    if (!desc.trim() || !amount || !card) {
      toast("Preencha o nome, o valor e o cartão.", "error");
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
    const tx = applyMerchantRule(d.config.merchantRules, base);
    void updateStatement(d.month, (s) => ({ ...s, transactions: [...s.transactions, tx].sort((a, b) => a.date.localeCompare(b.date)) }));
    toast(d.config.merchantRules?.[merchantKey] ? "Compra salva com a categoria e a divisão que o app lembrou." : "Compra salva.", "success");
    setDesc("");
    setValue("");
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Compra feita à mão" description="Entra na fatura deste mês do cartão escolhido.">
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
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
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

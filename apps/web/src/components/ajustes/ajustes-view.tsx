"use client";

import { CloudCheck, CreditCard as CardIcon, EyeOff, HardDrive, KeyRound, LogOut, Plus, RotateCcw, ShieldCheck, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useDerived } from "@/lib/client/derived";
import { api, useStore } from "@/lib/client/store";
import { CATEGORIES } from "@/lib/domain/categories";
import { formatBRL, parseMoneyToCents } from "@/lib/domain/money";
import type { CardBrand, CategoryId, CreditCard, HouseholdConfig, UserId } from "@/lib/domain/types";
import { CreditCardVisual } from "../home/credit-card";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Input, Label, Select } from "../ui/field";
import { IconBox } from "../ui/icon-box";
import { Sheet } from "../ui/sheet";
import { OpenFinanceCard } from "./open-finance-card";

function MoneyField({ value, onCommit, disabled }: { value: number; onCommit: (c: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(formatBRL(value));
  if (disabled) {
    return (
      <div className="flex h-11 items-center gap-2 rounded-2xl border border-dashed border-slate-200 px-3 text-xs text-zinc-500">
        <EyeOff className="size-4" /> Oculto no modo %
      </div>
    );
  }
  return (
    <Input
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const c = parseMoneyToCents(text);
        if (c !== null && c >= 0) {
          onCommit(c);
          setText(formatBRL(c));
        } else setText(formatBRL(value));
      }}
    />
  );
}

export function AjustesView({ signOutAction }: { signOutAction: () => Promise<void> }) {
  const { state, updateConfig, privacy, reload, toast } = useStore();
  const d = useDerived();
  const cfg = d.config;
  const [newCard, setNewCard] = useState<CreditCard | null>(null);
  const set = (fn: (c: HouseholdConfig) => HouseholdConfig) => void updateConfig(fn);
  const mode = state!.mode;

  return (
    <div className="space-y-4 pt-1">
      <h2 className="text-base font-semibold text-zinc-900">Ajustes</h2>

      <Card>
        <CardHeader icon={<IconBox>{mode.storage === "drive" ? <CloudCheck /> : <HardDrive />}</IconBox>} title="Armazenamento e segurança" />
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between gap-3"><span className="text-zinc-500">Banco de dados</span><b>{mode.storage === "drive" ? "Google Drive (pasta compartilhada)" : "Local (.data/)"}</b></li>
          <li className="flex justify-between gap-3"><span className="text-zinc-500">Criptografia AES-256-GCM</span><b className={mode.encrypted ? "text-emerald-600" : "text-amber-600"}>{mode.encrypted ? "Ativa" : "Desligada (defina ENCRYPTION_SECRET)"}</b></li>
          <li className="flex justify-between gap-3"><span className="text-zinc-500">Login Google</span><b>{mode.authConfigured ? "Configurado (2 e-mails)" : "Modo demo, sem login"}</b></li>
          <li className="flex justify-between gap-3"><span className="text-zinc-500">Drive configurado</span><b>{mode.driveConfigured ? "Sim" : "Não"}</b></li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {mode.authConfigured && !mode.driveConfigured && (
            <Button variant="outline" size="sm" asChild>
              <a href="/api/drive/connect"><KeyRound /> Gerar refresh token do Drive</a>
            </Button>
          )}
          {mode.storage === "local" && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await api("/api/demo/reset", { method: "POST" });
                toast("Dados de demonstração restaurados.", "success");
                await reload();
              }}
            >
              <RotateCcw /> Restaurar dados de demonstração
            </Button>
          )}
          {!mode.demo && (
            <form action={signOutAction}>
              <Button variant="danger" size="sm" type="submit"><LogOut /> Sair</Button>
            </form>
          )}
        </div>
      </Card>

      <OpenFinanceCard config={cfg} />

      <Card>
        <CardHeader icon={<IconBox><Users /></IconBox>} title="Casal e divisão padrão" />
        <div className="grid gap-3 sm:grid-cols-2">
          {(["USER_A", "USER_B"] as UserId[]).map((u) => (
            <label key={u} className="block">
              <Label>{u === "USER_A" ? "Pessoa A (ALLOWED_USER_EMAIL_1)" : "Pessoa B (ALLOWED_USER_EMAIL_2)"}</Label>
              <Input
                defaultValue={cfg.users[u].name}
                maxLength={40}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== cfg.users[u].name) set((c) => ({ ...c, users: { ...c.users, [u]: { ...c.users[u], name } } }));
                }}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 p-3">
          <div className="mb-2 flex justify-between text-xs font-semibold">
            <span className="text-brand-600">{cfg.users.USER_A.name} {cfg.defaultSplitPercentA}%</span>
            <span className="text-emerald-600">{cfg.users.USER_B.name} {100 - cfg.defaultSplitPercentA}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            defaultValue={cfg.defaultSplitPercentA}
            onPointerUp={(e) => set((c) => ({ ...c, defaultSplitPercentA: Number((e.target as HTMLInputElement).value) }))}
            onKeyUp={(e) => set((c) => ({ ...c, defaultSplitPercentA: Number((e.target as HTMLInputElement).value) }))}
            className="w-full accent-zinc-900"
            aria-label="Divisão padrão"
          />
          <p className="mt-1 text-[11px] text-zinc-500">Usada em toda compra marcada como “Divisão padrão”. Ex.: 60/40 para dividir proporcional à renda.</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Meta e tetos por setor" subtitle="Base do medidor de saúde e dos alertas de estouro" />
        <label className="mb-3 block">
          <Label>Meta mensal das faturas</Label>
          <MoneyField value={cfg.monthlyGoal} disabled={privacy} onCommit={(v) => set((c) => ({ ...c, monthlyGoal: v }))} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(CATEGORIES) as CategoryId[])
            .filter((k) => !CATEGORIES[k].essential || cfg.sectorBudgets[k] !== undefined)
            .map((k) => (
              <label key={k} className="block">
                <Label>{CATEGORIES[k].label}</Label>
                <MoneyField
                  value={cfg.sectorBudgets[k] ?? 0}
                  disabled={privacy}
                  onCommit={(v) =>
                    set((c) => {
                      const sectorBudgets = { ...c.sectorBudgets };
                      if (v > 0) sectorBudgets[k] = v;
                      else delete sectorBudgets[k];
                      return { ...c, sectorBudgets };
                    })
                  }
                />
              </label>
            ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <Label>Alerta acima da média (%)</Label>
            <Input
              type="number"
              min={0}
              max={500}
              defaultValue={cfg.savingsRules.movingAverageThresholdPct}
              onBlur={(e) => set((c) => ({ ...c, savingsRules: { ...c.savingsRules, movingAverageThresholdPct: Math.max(0, Number(e.target.value) || 0) } }))}
            />
          </label>
          <label className="block">
            <Label>Formiguinha: mín. de compras</Label>
            <Input
              type="number"
              min={2}
              max={100}
              defaultValue={cfg.savingsRules.highFrequencyMinOccurrences}
              onBlur={(e) => set((c) => ({ ...c, savingsRules: { ...c.savingsRules, highFrequencyMinOccurrences: Math.max(2, Number(e.target.value) || 8) } }))}
            />
          </label>
        </div>
      </Card>

      <Card id="cartoes">
        <CardHeader
          icon={<IconBox><CardIcon /></IconBox>}
          title="Cartões"
          subtitle="Apenas apelido, bandeira e 4 últimos dígitos"
          action={
            <Button size="sm" variant="outline" onClick={() => setNewCard({ id: `card-${Date.now().toString(36)}`, owner: state!.viewer.userId, nickname: "", last4: "", brand: "mastercard", theme: cfg.cards.length % 4 })}>
              <Plus /> Adicionar
            </Button>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {cfg.cards.map((c) => (
            <div key={c.id}>
              <CreditCardVisual card={c} ownerName={cfg.users[c.owner].name} />
              <button
                className="mt-1.5 inline-flex items-center gap-1 px-1 text-xs font-semibold text-rose-600"
                onClick={() => {
                  if (d.allTxs.some((t) => t.cardId === c.id)) {
                    toast("Este cartão tem transações no mês; remova-as antes.", "error");
                    return;
                  }
                  set((x) => ({ ...x, cards: x.cards.filter((y) => y.id !== c.id) }));
                }}
              >
                <Trash2 className="size-3.5" /> Remover
              </button>
            </div>
          ))}
        </div>
      </Card>

      <p className="flex items-center justify-center gap-1.5 pb-4 text-center text-[11px] text-zinc-400">
        <ShieldCheck className="size-3.5" /> Somente leitura: o Corujinha nunca faz pagamentos, Pix ou transferências.
      </p>

      <Sheet open={!!newCard} onOpenChange={(o) => !o && setNewCard(null)} title="Novo cartão" description="Nunca digite o número completo: só os 4 últimos dígitos.">
        {newCard && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^\d{4}$/.test(newCard.last4) || !newCard.nickname.trim()) return;
              set((c) => ({ ...c, cards: [...c.cards, { ...newCard, nickname: newCard.nickname.trim() }] }));
              setNewCard(null);
            }}
          >
            <CreditCardVisual card={{ ...newCard, last4: newCard.last4 || "0000", nickname: newCard.nickname || "Apelido" }} ownerName={cfg.users[newCard.owner].name} />
            <label className="block">
              <Label>Apelido</Label>
              <Input value={newCard.nickname} maxLength={40} onChange={(e) => setNewCard({ ...newCard, nickname: e.target.value })} placeholder="Ex.: Nubank" />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <Label>4 últimos</Label>
                <Input inputMode="numeric" maxLength={4} value={newCard.last4} onChange={(e) => setNewCard({ ...newCard, last4: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="1327" />
              </label>
              <label className="block">
                <Label>Bandeira</Label>
                <Select value={newCard.brand} onChange={(e) => setNewCard({ ...newCard, brand: e.target.value as CardBrand })}>
                  {["mastercard", "visa", "elo", "amex", "hipercard", "outra"].map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <Label>Titular</Label>
                <Select value={newCard.owner} onChange={(e) => setNewCard({ ...newCard, owner: e.target.value as UserId })}>
                  <option value="USER_A">{cfg.users.USER_A.name}</option>
                  <option value="USER_B">{cfg.users.USER_B.name}</option>
                </Select>
              </label>
            </div>
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((t) => (
                <button type="button" key={t} onClick={() => setNewCard({ ...newCard, theme: t })} className={"h-8 flex-1 rounded-xl border-2 " + (newCard.theme === t ? "border-zinc-900" : "border-transparent")} style={{ background: ["#8fa6f7", "#a7f3d0", "#f0abfc", "#60a5fa"][t] }} aria-label={`Tema ${t + 1}`} />
              ))}
            </div>
            <Button type="submit" className="w-full" disabled={!/^\d{4}$/.test(newCard.last4) || !newCard.nickname.trim()}>Salvar cartão</Button>
          </form>
        )}
      </Sheet>
    </div>
  );
}

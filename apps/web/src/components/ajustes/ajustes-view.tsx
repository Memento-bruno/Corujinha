"use client";

import { ArrowUp, CloudCheck, ReceiptText, Target, CreditCard as CardIcon, Eye, EyeOff, Wallet, HardDrive, KeyRound, LogOut, Plus, RotateCcw, ShieldCheck, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useDerived } from "@/lib/client/derived";
import { api, useStore } from "@/lib/client/store";
import { CATEGORIES } from "@/lib/domain/categories";
import { formatBRL, parseMoneyToCents } from "@/lib/domain/money";
import { cardGroups } from "@/lib/domain/card-groups";
import type { CardBrand, CategoryId, CreditCard, HouseholdConfig, Split, UserId } from "@/lib/domain/types";
import { CreditCardVisual } from "../home/credit-card";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Input, Label, Select } from "../ui/field";
import { IconBox } from "../ui/icon-box";
import { Sheet } from "../ui/sheet";
import { BackupsCard } from "./backups-card";
import { ClosingCard } from "./closing-card";
import { Switch } from "../ui/switch";
import { MerchantsCard } from "./merchants-card";
import { OpenFinanceCard } from "./open-finance-card";
import { SubscriptionsCard } from "./subscriptions-card";
import { RecurringTab } from "../faturas/recurring-tab";
import { ValueMode } from "../shell/value-mode";

const SECTIONS = [
  ["casal", "Casal"],
  ["renda", "Renda"],
  ["metas", "Meta e tetos"],
  ["cartoes", "Cartões"],
  ["contas", "Contas e vencimentos"],
  ["fornecedores", "Fornecedores"],
  ["assinaturas", "Assinaturas"],
  ["valores", "Valores"],
  ["open-finance", "Banco"],
  ["seguranca", "Segurança"],
] as const;

/** Renda do casal: cada um coloca o próprio salário líquido. O valor nunca aparece em outra tela, só porcentagens. */
function IncomeCard({ cfg, me, set }: { cfg: HouseholdConfig; me: UserId; set: (fn: (c: HouseholdConfig) => HouseholdConfig) => void }) {
  const [text, setText] = useState("");
  const [show, setShow] = useState(false);
  const partner: UserId = me === "USER_A" ? "USER_B" : "USER_A";
  const mine = cfg.incomes?.[me] ?? 0;
  const save = () => {
    const c = parseMoneyToCents(text);
    if (c === null || c < 0) return;
    set((x) => ({ ...x, incomes: { ...x.incomes, [me]: c } }));
    setText("");
    setShow(false);
  };
  return (
    <Card id="renda">
      <CardHeader icon={<IconBox><Wallet /></IconBox>} title="Renda do casal" subtitle="Só para calcular quanto da renda os gastos usam" />
      <p className="mb-3 text-xs text-zinc-500">O valor fica escondido e nunca aparece em outras telas, só a porcentagem.</p>
      <label className="block">
        <Label>Seu salário líquido ({cfg.users[me].name.split(" ")[0]})</Label>
        <div className="flex gap-2">
          <Input
            type={show ? "text" : "password"}
            inputMode="decimal"
            autoComplete="off"
            placeholder={mine ? "•••••••• (já salvo, digite para trocar)" : "Ex.: 8.500,00"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <Button variant="outline" size="sm" type="button" onClick={() => setShow(!show)} aria-label={show ? "Esconder o que digitei" : "Mostrar o que digitei"}>
            {show ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      </label>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="text-zinc-500">
          {cfg.users[partner].name.split(" ")[0]}: <b className="text-zinc-800">{cfg.incomes?.[partner] ? "já colocou" : "ainda não colocou"}</b>
        </span>
        <Button size="sm" type="button" onClick={save} disabled={!text.trim()}>
          Salvar
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">Cada um só consegue mudar o próprio salário.</p>
    </Card>
  );
}

/** Lembrete por e-mail 3 dias antes e no dia do vencimento (cada um liga o seu). */
function ReminderToggle({ cfg, me, on, set }: { cfg: HouseholdConfig; me: UserId; on: boolean; set: (fn: (c: HouseholdConfig) => HouseholdConfig) => void }) {
  const mine = cfg.reminderEmails?.[me] !== false;
  return (
    <div className="mb-4 rounded-2xl bg-zinc-50 p-3">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-semibold">Lembrete por e-mail</span>
          <span className="block text-xs text-zinc-500">3 dias antes e no dia, só das contas e faturas que são suas. O e-mail não mostra valores.</span>
        </span>
        <Switch
          checked={on && mine}
          disabled={!on}
          onCheckedChange={(v) => set((c) => ({ ...c, reminderEmails: { ...c.reminderEmails, [me]: v } }))}
        />
      </label>
      {!on && <p className="mt-2 text-xs text-amber-700">Ainda desligado no servidor: falta configurar o envio de e-mail (veja o DEPLOY.md, passo 8).</p>}
    </div>
  );
}

/** Divisão padrão do casal: dá para arrastar ou digitar o percentual de cada um. */
function DefaultSplit({ cfg, set }: { cfg: HouseholdConfig; set: (fn: (c: HouseholdConfig) => HouseholdConfig) => void }) {
  const [a, setA] = useState(cfg.defaultSplitPercentA);
  const [draft, setDraft] = useState<{ A?: string; B?: string }>({});
  const save = (v: number) => {
    const n = Math.max(0, Math.min(100, Math.round(v)));
    setA(n);
    setDraft({});
    if (n !== cfg.defaultSplitPercentA) set((c) => ({ ...c, defaultSplitPercentA: n }));
  };
  const field = (who: "A" | "B") => {
    const value = draft[who] ?? String(who === "A" ? a : 100 - a);
    const commit = () => {
      const n = Number(String(draft[who] ?? "").replace(",", "."));
      if (draft[who] === undefined || !Number.isFinite(n)) return setDraft({});
      save(who === "A" ? n : 100 - n);
    };
    const u = who === "A" ? cfg.users.USER_A : cfg.users.USER_B;
    return (
      <label className="flex items-center gap-2">
        <span className={"text-sm font-semibold " + (who === "A" ? "text-brand-600" : "text-emerald-600")}>{u.name.split(" ")[0]}</span>
        <span className="relative">
          <Input
            inputMode="numeric"
            className="h-10 w-20 pr-7 text-right tabular"
            value={value}
            aria-label={`Percentual de ${u.name}`}
            onChange={(e) => setDraft({ [who]: e.target.value.replace(/[^\d,.]/g, "").slice(0, 5) })}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-zinc-500">%</span>
        </span>
      </label>
    );
  };
  return (
    <div className="mt-4 rounded-2xl bg-slate-50 p-3">
      <p className="mb-2 text-xs font-semibold text-zinc-500">Divisão padrão (arraste ou digite)</p>
      <div className="mb-3 flex items-center justify-between gap-3">
        {field("A")}
        {field("B")}
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={a}
        onChange={(e) => setA(Number(e.target.value))}
        onPointerUp={(e) => save(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => save(Number((e.target as HTMLInputElement).value))}
        className="w-full accent-zinc-900"
        aria-label="Divisão padrão"
      />
      <p className="mt-1 text-[11px] text-zinc-500">Usada em toda compra marcada como “Divisão padrão”. Ex.: 60/40 para dividir proporcional à renda.</p>
    </div>
  );
}

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

/** De quem são as compras de um cartão (ex.: adicional que só um dos dois usa). */
function CardSplitSelect({ card, label }: { card: CreditCard; label: string }) {
  const { state, updateConfig, updateStatement, toast } = useStore();
  const cfg = state!.config.data;
  const first = (u: UserId) => cfg.users[u].name.split(" ")[0];
  const value = card.defaultSplit?.type === "INDIVIDUAL_A" ? "A" : card.defaultSplit?.type === "INDIVIDUAL_B" ? "B" : "";
  const change = async (v: string) => {
    const split: Split | undefined = v === "A" ? { type: "INDIVIDUAL_A" } : v === "B" ? { type: "INDIVIDUAL_B" } : undefined;
    const before = card.defaultSplit ?? { type: "SHARED_DEFAULT" };
    const ok = await updateConfig((c) => ({
      ...c,
      cards: c.cards.map((x) => {
        if (x.id !== card.id) return x;
        const { defaultSplit: _old, ...rest } = x;
        void _old;
        return split ? { ...rest, defaultSplit: split } : rest;
      }),
    }));
    if (!ok) return;
    // Compras deste cartão nos meses ainda abertos que estavam com a divisão antiga do cartão passam para a nova.
    const after = split ?? { type: "SHARED_DEFAULT" as const };
    let changed = 0;
    for (const [m, f] of Object.entries(state!.statements)) {
      if (f.data.snapshot) continue;
      const hits = f.data.transactions.filter((t) => t.cardId === card.id && t.split.type === before.type).length;
      if (!hits) continue;
      changed += hits;
      await updateStatement(m, (s) => ({
        ...s,
        transactions: s.transactions.map((t) => (t.cardId === card.id && t.split.type === before.type ? { ...t, split: after } : t)),
      }));
    }
    toast(changed ? `Salvo. Mudei ${changed} compra${changed === 1 ? "" : "s"} deste cartão nos meses abertos.` : "Salvo.", "success");
  };
  return (
    <label className="mt-1.5 block px-1">
      <span className="text-[11px] font-semibold text-zinc-500">{label}</span>
      <Select className="h-9 text-xs" value={value} onChange={(e) => void change(e.target.value)}>
        <option value="">Divisão padrão do casal</option>
        <option value="A">Só de {first("USER_A")}</option>
        <option value="B">Só de {first("USER_B")}</option>
      </Select>
    </label>
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
      <h2 className="text-base font-semibold text-zinc-900">Configurações</h2>
      <nav aria-label="Seções" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="h-9 shrink-0 rounded-full border border-zinc-200 bg-white px-3.5 text-sm leading-9 font-semibold whitespace-nowrap text-zinc-800 hover:bg-zinc-50">
            {label}
          </a>
        ))}
      </nav>

      <Card id="casal">
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
        <DefaultSplit cfg={cfg} set={set} />
      </Card>

      <IncomeCard cfg={cfg} me={state!.viewer.userId} set={set} />

      <Card id="metas">
        <CardHeader icon={<IconBox><Target /></IconBox>} title="Meta do mês e tetos por setor" subtitle="Base do velocímetro, da saúde financeira e dos alertas" />
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
        <p className="mb-3 text-xs text-zinc-500">
          Cartões virtuais e adicionais ficam junto do cartão principal, porque caem na mesma fatura. Em cada um dá para dizer de quem são as compras.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {cardGroups(cfg.cards).map(({ card: c, children }) => (
            <div key={c.id} className="min-w-0">
              <CreditCardVisual compact card={c} ownerName={cfg.users[c.owner].name} />
              <CardSplitSelect card={c} label="Compras deste cartão" />
              {children.map((v) => (
                <CardSplitSelect key={v.id} card={v} label={`Final ${v.last4}`} />
              ))}
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

      <Card id="contas">
        <CardHeader icon={<IconBox><ReceiptText /></IconBox>} title="Contas fixas, boletos e vencimentos" subtitle="Aluguel, condomínio, água, internet, parcela do carro e compras do cartão que se repetem" />
        <ReminderToggle cfg={cfg} me={state!.viewer.userId} on={Boolean(mode.remindersConfigured)} set={set} />
        <RecurringTab />
      </Card>

      <ClosingCard cfg={cfg} />

      <MerchantsCard cfg={cfg} set={set} />

      <SubscriptionsCard cfg={cfg} set={set} />

      <Card id="valores">
        <CardHeader icon={<IconBox><Eye /></IconBox>} title="Como mostrar os valores" subtitle="Vale para todas as telas, neste aparelho" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ul className="space-y-1 text-sm text-zinc-600">
            <li><Eye className="mr-1.5 inline size-4" />Valor completo: R$ 2.536,83</li>
            <li><ArrowUp className="mr-1.5 inline size-4" />Em milhares: R$ 4.260,00 vira R$ 4,26</li>
            <li><EyeOff className="mr-1.5 inline size-4" />Escondido: só porcentagens</li>
          </ul>
          <ValueMode />
        </div>
      </Card>

      <OpenFinanceCard config={cfg} />

      {mode.storage === "drive" && <BackupsCard />}

      <Card id="seguranca">
        <CardHeader icon={<IconBox>{mode.storage === "drive" ? <CloudCheck /> : <HardDrive />}</IconBox>} title="Armazenamento e segurança" />
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between gap-3"><span className="text-zinc-500">Banco de dados</span><b>{mode.storage === "drive" ? "Google Drive (pasta compartilhada)" : "Local (.data/)"}</b></li>
          <li className="flex justify-between gap-3"><span className="text-zinc-500">Criptografia AES-256-GCM</span><b className={mode.encrypted ? "text-emerald-600" : "text-amber-600"}>{mode.encrypted ? "Ativa" : "Desligada (defina ENCRYPTION_SECRET)"}</b></li>
          <li className="flex justify-between gap-3"><span className="text-zinc-500">Login Google</span><b>{mode.authConfigured ? "Configurado (2 e-mails)" : "Modo demo, sem login"}</b></li>
          <li className="flex justify-between gap-3"><span className="text-zinc-500">Drive configurado</span><b>{mode.driveConfigured ? "Sim" : "Não"}</b></li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {mode.authConfigured && (
            <Button variant="outline" size="sm" asChild>
              <a href="/api/drive/connect"><KeyRound /> {mode.driveConfigured ? "Renovar conexão com o Drive" : "Gerar refresh token do Drive"}</a>
            </Button>
          )}
          {mode.authConfigured && (
            <Button variant="ghost" size="sm" asChild>
              <a href="/api/drive/connect?acesso=restrito"><ShieldCheck /> Testar acesso menor ao Drive</a>
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

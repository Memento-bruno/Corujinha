"use client";

import { Check, CheckCheck, ChevronDown, Lock, MessageCircleQuestion, Repeat, Search, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/domain/categories";
import { otherUser, type CategoryId, type PurchaseQuestion, type RecurringDebt, type Split, type Transaction } from "@/lib/domain/types";
import { SUBSCRIPTION_TAG, isSubscription } from "@/lib/engines/analytics";
import { alwaysSplitOf, learnMerchant, propagateToSameMerchant, setMerchantAlwaysSplit } from "@/lib/engines/merchants";
import { isSamePurchase } from "@/lib/engines/installments";
import { cardRecurringFor } from "@/lib/engines/recurring";
import { cn } from "@/lib/utils";
import { closingLabel } from "@/lib/domain/closing";
import { PERSON } from "../home/colors";
import { MerchantLogo } from "../home/merchant-logo";
import { Switch } from "../ui/switch";
import { splitLabel } from "./split-badge";

type Filter = "all" | "rev" | "ask" | "shared" | "a" | "b" | "parc" | "subs" | "prev";
type Sort = "recent" | "high" | "low";

const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });

function dayLabel(date: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const wd = WEEKDAY.format(new Date(`${date}T12:00:00Z`)).replace("-feira", "");
  const dm = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const pre = date === today ? "Hoje, " : date === yest ? "Ontem, " : "";
  const s = `${pre}${pre ? wd : wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`;
  return s;
}

const isShared = (s: Split) => s.type === "SHARED_DEFAULT" || s.type === "SHARED_CUSTOM";

export function Purchases({ txs, closed, cardName, onClearCard }: { txs: Transaction[]; closed: boolean; cardName?: string; onClearCard: () => void }) {
  const { state, updateStatement, updateConfig, updateRecurring, toast } = useStore();
  const d = useDerived();
  const fmt = useFmt(d.coupleTotal);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [open, setOpen] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; text: string } | null>(null);
  const me = state!.viewer.userId;
  // Vindo do Início ("Para conferir"): abre já filtrado.
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("filtro");
    if (f === "revisar") setFilter("rev");
    if (f === "perguntas") setFilter("ask");
  }, []);
  const debts = state!.recurring.data.debts;
  const cards = Object.fromEntries(d.config.cards.map((c) => [c.id, c]));
  const first = (u: "USER_A" | "USER_B") => d.users[u].name.split(" ")[0];

  const counts = useMemo(() => {
    const real = txs.filter((t) => !t.predictedFrom);
    return {
      all: real.length,
      rev: real.filter((t) => t.toReview).length,
      ask: real.filter((t) => t.question && !t.question.answer).length,
      shared: real.filter((t) => isShared(t.split)).length,
      a: real.filter((t) => t.split.type === "INDIVIDUAL_A").length,
      b: real.filter((t) => t.split.type === "INDIVIDUAL_B").length,
      parc: real.filter((t) => t.installment && t.installment.total > 1).length,
      subs: txs.filter((t) => isSubscription(t, d.config)).length,
      prev: txs.filter((t) => t.predictedFrom).length,
    };
  }, [txs, d.config]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const num = needle.replace(/[^\d,]/g, "").replace(",", ".");
    return txs.filter((t) => {
      if (needle) {
        const hay = `${t.description} ${CATEGORIES[t.category].label}`.toLowerCase();
        const byValue = num && (Math.abs(t.amount) / 100).toFixed(2).includes(num);
        if (!hay.includes(needle) && !byValue) return false;
      }
      switch (filter) {
        case "rev":
          return Boolean(t.toReview) && !t.predictedFrom;
        case "ask":
          return Boolean(t.question && !t.question.answer);
        case "shared":
          return !t.predictedFrom && isShared(t.split);
        case "a":
          return !t.predictedFrom && t.split.type === "INDIVIDUAL_A";
        case "b":
          return !t.predictedFrom && t.split.type === "INDIVIDUAL_B";
        case "parc":
          return !t.predictedFrom && Boolean(t.installment && t.installment.total > 1);
        case "subs":
          return isSubscription(t, d.config);
        case "prev":
          return Boolean(t.predictedFrom);
        default:
          return true;
      }
    });
  }, [txs, d.config, q, filter]);

  const sorted = useMemo(() => {
    const l = [...list];
    if (sort === "high") l.sort((a, b) => b.amount - a.amount);
    else if (sort === "low") l.sort((a, b) => a.amount - b.amount);
    else l.sort((a, b) => b.date.localeCompare(a.date));
    return l;
  }, [list, sort]);

  const realRows = sorted.filter((t) => !t.predictedFrom);
  const predicted = sorted.filter((t) => t.predictedFrom);
  const groups = useMemo(() => {
    if (sort !== "recent") return [["", realRows] as const];
    const m = new Map<string, Transaction[]>();
    for (const t of realRows) m.set(t.date, [...(m.get(t.date) ?? []), t]);
    return [...m.entries()];
  }, [realRows, sort]);

  /** Liga/desliga "repete todo mês" e mantém a recorrente com a mesma divisão e setor da compra. */
  const syncRecurring = (t: Transaction, repeat: boolean) => {
    void updateRecurring((r) => {
      const cur = cardRecurringFor(r.debts, t);
      if (!repeat) return cur ? { ...r, debts: r.debts.filter((x) => x.id !== cur.id) } : r;
      if (cur) return { ...r, debts: r.debts.map((x) => (x.id === cur.id ? { ...x, split: t.split, category: t.category, active: true } : x)) };
      const debt: RecurringDebt = {
        id: `rec-${Date.now().toString(36)}`,
        description: t.description,
        kind: "CARTAO",
        amount: Math.abs(t.amount),
        paidBy: t.paidBy,
        split: t.split,
        category: t.category,
        dueDay: Number(t.date.slice(8, 10)) || 1,
        startMonth: d.month,
        active: true,
        cardId: t.cardId,
        merchantKey: t.merchantKey,
      };
      return { ...r, debts: [...r.debts, debt] };
    });
  };

  /**
   * Muda setor/divisão e salva. O setor é lembrado e passa para as outras compras da loja no mês.
   * Quem paga vale só para esta compra (cada um paga a da própria fatura); para a loja ficar sempre
   * dividida existe o botão "Sempre dividir".
   */
  const change = (before: Transaction, edited: Transaction) => {
    const { toReview: _r, ...after } = edited;
    const learned: { category?: CategoryId } = {};
    if (before.category !== after.category) learned.category = after.category;
    const splitChanged = JSON.stringify(before.split) !== JSON.stringify(after.split);
    const always = alwaysSplitOf(d.config.merchantRules, after.merchantKey);
    // Loja marcada "sempre dividir" e a divisão mudou para outra divisão: a loja passa a usar a nova.
    if (splitChanged && always && isShared(after.split)) {
      void updateConfig((c) => ({ ...c, merchantRules: setMerchantAlwaysSplit(c.merchantRules, after, after.split) }));
    }
    const name = before.description;
    let others = 0;
    if (after.predictedFrom) {
      syncRecurring(after, true);
    } else {
      others = propagateToSameMerchant(d.allTxs.filter((t) => !t.predictedFrom), before, after).changed;
      void updateStatement(d.month, (s) => {
        const prev = s.transactions.find((t) => t.id === after.id) ?? before;
        return { ...s, transactions: propagateToSameMerchant(s.transactions, prev, after).transactions };
      });
      if (cardRecurringFor(debts, after)) syncRecurring(after, true);
      // Compra parcelada: a mudança vale para as parcelas dos outros meses ainda abertos.
      if ((learned.category || splitChanged) && after.installment && after.installment.total > 1) {
        for (const [m, f] of Object.entries(state!.statements)) {
          if (m === d.month || f.data.snapshot) continue;
          if (!f.data.transactions.some((t) => isSamePurchase(d.month, after, m, t))) continue;
          void updateStatement(m, (s) => ({
            ...s,
            transactions: s.transactions.map((t) =>
              isSamePurchase(d.month, after, m, t)
                ? { ...t, ...(learned.category ? { category: after.category } : {}), ...(splitChanged ? { split: after.split } : {}) }
                : t,
            ),
          }));
        }
      }
    }
    if (learned.category) {
      void updateConfig((c) => ({ ...c, merchantRules: learnMerchant(c.merchantRules, after, learned) }));
      setSaved({
        id: after.id,
        text: `Salvo e lembrado: as próximas compras de ${name} já chegam como ${CATEGORIES[after.category].label}.${others ? ` Mudei também ${others} outra${others === 1 ? "" : "s"} compra${others === 1 ? "" : "s"} dele${others === 1 ? "" : "s"} deste mês.` : ""}`,
      });
    } else if (splitChanged) {
      setSaved({ id: after.id, text: `Salvo só nesta compra: ${splitLabel(after.split, d.config)}.` });
    }
  };

  /** Botão "Sempre dividir": a loja passa a chegar dividida em todas as faturas, dos dois. */
  const toggleAlwaysSplit = (t: Transaction, on: boolean) => {
    const split: Split = on ? (isShared(t.split) ? t.split : { type: "SHARED_DEFAULT" }) : t.split;
    void updateConfig((c) => ({ ...c, merchantRules: setMerchantAlwaysSplit(c.merchantRules, t, on ? split : null) }));
    if (on) {
      // As compras dessa loja que já estão neste mês também ficam divididas.
      void updateStatement(d.month, (s) => ({
        ...s,
        transactions: s.transactions.map((x) => (x.merchantKey === t.merchantKey && x.amount > 0 && !isShared(x.split) ? { ...x, split } : x)),
      }));
    }
    setSaved({
      id: t.id,
      text: on
        ? `Salvo: ${t.description} vai chegar sempre dividida, nas duas faturas.`
        : `Salvo: ${t.description} volta a ser de quem é o dono da fatura.`,
    });
  };

  const toggleSub = (t: Transaction, on: boolean) => {
    if (on) void updateConfig((c) => ({ ...c, subscriptionMerchants: [...new Set([...c.subscriptionMerchants, t.merchantKey])] }));
    void updateStatement(d.month, (s) => ({
      ...s,
      transactions: s.transactions.map((x) =>
        x.id === t.id || (on && x.merchantKey === t.merchantKey)
          ? { ...x, tags: on ? [...new Set([...x.tags, SUBSCRIPTION_TAG])] : x.tags.filter((g) => g !== SUBSCRIPTION_TAG) }
          : x,
      ),
    }));
    if (!on) void updateConfig((c) => ({ ...c, subscriptionMerchants: c.subscriptionMerchants.filter((k) => k !== t.merchantKey) }));
  };

  /** Atualiza só esta compra no arquivo do mês (pela versão mais nova dela). */
  const patch = (id: string, fn: (t: Transaction) => Transaction) =>
    void updateStatement(d.month, (s) => ({ ...s, transactions: s.transactions.map((x) => (x.id === id ? fn(x) : x)) }));

  const confirm = (t: Transaction) => {
    patch(t.id, ({ toReview: _r, ...x }) => x);
    setSaved({ id: t.id, text: "Conferida." });
  };

  const confirmAll = (ids: string[]) => {
    const set = new Set(ids);
    void updateStatement(d.month, (s) => ({ ...s, transactions: s.transactions.map((x) => (set.has(x.id) ? (({ toReview: _r, ...y }) => y)(x) : x)) }));
    toast(`${ids.length} compra${ids.length === 1 ? "" : "s"} conferida${ids.length === 1 ? "" : "s"}.`, "success");
    setFilter("all");
  };

  const ask = (t: Transaction, q: PurchaseQuestion | undefined) => {
    patch(t.id, (x) => {
      const { question: _q, ...rest } = x;
      return q ? { ...rest, question: q } : rest;
    });
  };

  const remove = (t: Transaction) => {
    if (t.predictedFrom) {
      syncRecurring(t, false);
      toast("Não vai mais ser prevista.");
    } else {
      void updateStatement(d.month, (s) => ({ ...s, transactions: s.transactions.filter((x) => x.id !== t.id) }));
      toast("Compra removida.");
    }
    setOpen(null);
  };

  const markSubscriptions = (keys: string[]) => {
    void updateConfig((c) => ({ ...c, subscriptionMerchants: [...new Set([...c.subscriptionMerchants, ...keys])] }));
    void updateStatement(d.month, (s) => ({
      ...s,
      transactions: s.transactions.map((t) => (keys.includes(t.merchantKey) && !t.tags.includes(SUBSCRIPTION_TAG) ? { ...t, tags: [...t.tags, SUBSCRIPTION_TAG] } : t)),
    }));
    toast("Marcado como assinatura.", "success");
  };

  const chips: { value: Filter; label: string; n: number }[] = [
    { value: "all", label: "Todas", n: counts.all },
    { value: "rev", label: "Para conferir", n: counts.rev },
    { value: "ask", label: "Perguntas", n: counts.ask },
    { value: "shared", label: "Divididas", n: counts.shared },
    { value: "a", label: `Só ${first("USER_A")}`, n: counts.a },
    { value: "b", label: `Só ${first("USER_B")}`, n: counts.b },
    { value: "parc", label: "Parceladas", n: counts.parc },
    { value: "subs", label: "Assinaturas", n: counts.subs },
    { value: "prev", label: "Previstas", n: counts.prev },
  ];

  const row = (t: Transaction) => (
    <Row
      key={t.id}
      tx={t}
      card={cards[t.cardId] ? `${cards[t.cardId].nickname} •••• ${cards[t.cardId].last4}` : "Cartão"}
      open={open === t.id}
      readOnly={closed}
      repeats={Boolean(t.predictedFrom || cardRecurringFor(debts, t))}
      saved={saved?.id === t.id ? saved.text : null}
      onToggle={() => {
        setOpen((o) => (o === t.id ? null : t.id));
        setSaved(null);
      }}
      onChange={(n) => change(t, n)}
      onRepeat={(v) => {
        syncRecurring(t, v);
        setSaved({ id: t.id, text: v ? "Salvo: vai aparecer prevista nas próximas faturas." : "Salvo: não vai mais ser prevista." });
        if (!v && t.predictedFrom) setOpen(null);
      }}
      onSub={(v) => toggleSub(t, v)}
      alwaysSplit={Boolean(alwaysSplitOf(d.config.merchantRules, t.merchantKey))}
      onAlwaysSplit={(v) => toggleAlwaysSplit(t, v)}
      onRemove={() => remove(t)}
      onConfirm={() => confirm(t)}
      onAsk={(q) => ask(t, q)}
      me={me}
      fmtMoney={fmt.money}
    />
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold sm:text-lg">Compras</h2>
        <label className="relative">
          <span className="sr-only">Ordenar</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-10 appearance-none rounded-full border border-zinc-300 bg-white pr-8 pl-4 text-sm font-semibold"
          >
            <option value="recent">Ordenar: mais recentes</option>
            <option value="high">Ordenar: maior valor</option>
            <option value="low">Ordenar: menor valor</option>
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2" />
        </label>
      </div>

      <label className="relative mt-4 block">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar loja, categoria ou valor"
          className="h-12 w-full rounded-2xl border border-zinc-200 bg-white pr-4 pl-11 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400"
        />
      </label>

      <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
        {chips
          .filter((c) => c.value === "all" || c.n > 0)
          .map((c) => (
            <button
              key={c.value}
              onClick={() => setFilter(c.value)}
              className={cn(
                "h-10 shrink-0 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition",
                filter === c.value ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
              )}
            >
              {c.label} · {c.n}
            </button>
          ))}
      </div>

      {cardName && (
        <p className="mt-3 flex items-center gap-2 text-sm text-zinc-600">
          Só o cartão <b>{cardName}</b>
          <button onClick={onClearCard} className="inline-flex items-center gap-0.5 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold">
            <X className="size-3" /> ver todos
          </button>
        </p>
      )}

      {closed ? (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
          <Lock className="size-4 shrink-0" /> Acerto deste mês fechado: as compras estão travadas. Reabra em Acerto para mudar.
        </p>
      ) : (
        <p className="mt-3 rounded-2xl bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-600">
          Toda compra entra como do <b>dono da fatura</b>. Toque numa compra para mudar <b>de quem é</b> (vale só para ela) e a <b>categoria</b>.
          Loja que é sempre dos dois? Abra a compra e ligue <b>Sempre dividir</b>.
        </p>
      )}

      {d.closing && d.lockedCount > 0 && (
        <p className="mt-2 flex items-center gap-2 rounded-2xl bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-600">
          <Lock className="size-4 shrink-0" /> {d.lockedCount} compra{d.lockedCount === 1 ? "" : "s"} até {closingLabel(d.closing)} ficaram no fechamento (já acertadas) e não entram nas contas.
        </p>
      )}

      {filter === "rev" && counts.rev > 0 && !closed && (
        <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-sky-50 p-3 sm:flex-row sm:items-center">
          <CheckCheck className="size-5 shrink-0 text-sky-700" />
          <p className="flex-1 text-sm text-zinc-700">
            Compras novas que o app ainda não conhecia. Toque em cada uma para acertar <b>de quem é</b> e a <b>categoria</b>, ou confirme todas como estão.
          </p>
          <button
            onClick={() => confirmAll(sorted.filter((t) => t.toReview).map((t) => t.id))}
            className="h-9 rounded-full bg-zinc-900 px-4 text-sm font-semibold text-white"
          >
            Estão certas
          </button>
        </div>
      )}

      {d.suggestedSubscriptions.length > 0 && !closed && (
        <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-indigo-50 p-3 sm:flex-row sm:items-center">
          <Sparkles className="size-5 shrink-0 text-[#4f52d6]" />
          <p className="flex-1 text-sm text-zinc-700">
            {d.suggestedSubscriptions.map((k) => d.allTxs.find((t) => t.merchantKey === k)?.description ?? k).join(", ")}{" "}
            {d.suggestedSubscriptions.length > 1 ? "aparecem" : "aparece"} todo mês com o mesmo valor. Marcar como assinatura?
          </p>
          <button onClick={() => markSubscriptions(d.suggestedSubscriptions)} className="h-9 rounded-full bg-zinc-900 px-4 text-sm font-semibold text-white">
            Marcar
          </button>
        </div>
      )}

      {sorted.length === 0 && <p className="mt-4 rounded-2xl bg-zinc-50 p-4 text-center text-sm text-zinc-500">Nenhuma compra aqui.</p>}

      {groups.map(([date, rows]) =>
        rows.length ? (
          <div key={date || "all"}>
            {date && <p className="mt-4 mb-2 px-1 text-sm font-semibold text-zinc-600">{dayLabel(date)}</p>}
            <ul className={cn("space-y-2", !date && "mt-4")}>{rows.map(row)}</ul>
          </div>
        ) : null,
      )}

      {predicted.length > 0 && (
        <div>
          <p className="mt-5 mb-2 px-1 text-sm font-semibold text-zinc-600">Ainda não chegou do banco</p>
          <ul className="space-y-2">{predicted.map(row)}</ul>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between px-1 text-sm text-zinc-500">
        <span>
          {sorted.length} compra{sorted.length === 1 ? "" : "s"}
        </span>
        <span className="tabular font-bold text-zinc-800">{fmt.money(sorted.reduce((s, t) => s + t.amount, 0))}</span>
      </div>
    </div>
  );
}

function Row({
  tx,
  card,
  open,
  readOnly,
  repeats,
  saved,
  onToggle,
  onChange,
  onRepeat,
  onSub,
  alwaysSplit,
  onAlwaysSplit,
  onRemove,
  onConfirm,
  onAsk,
  me,
  fmtMoney,
}: {
  tx: Transaction;
  card: string;
  open: boolean;
  readOnly: boolean;
  repeats: boolean;
  saved: string | null;
  onToggle: () => void;
  onChange: (t: Transaction) => void;
  onRepeat: (v: boolean) => void;
  onSub: (v: boolean) => void;
  alwaysSplit: boolean;
  onAlwaysSplit: (v: boolean) => void;
  onRemove: () => void;
  onConfirm: () => void;
  onAsk: (q: PurchaseQuestion | undefined) => void;
  me: "USER_A" | "USER_B";
  fmtMoney: (c: number) => string;
}) {
  const d = useDerived();
  const cat = CATEGORIES[tx.category];
  const first = (u: "USER_A" | "USER_B") => d.users[u].name.split(" ")[0];
  const s = tx.split;
  const badge =
    s.type === "INDIVIDUAL_A"
      ? { cls: "text-white", bg: PERSON.USER_A.bg }
      : s.type === "INDIVIDUAL_B"
        ? { cls: "text-emerald-950", bg: PERSON.USER_B.bg }
        : { cls: "bg-zinc-100 text-zinc-700" };
  const shareLabel = s.type === "SHARED_DEFAULT" && d.config.defaultSplitPercentA === 50 ? "Meio a meio" : splitLabel(s, d.config);
  const sub = isSubscription(tx, d.config);
  const pred = Boolean(tx.predictedFrom);

  const who: { key: string; label: string; split: Split }[] = [
    { key: "SHARED_DEFAULT", label: d.config.defaultSplitPercentA === 50 ? "Meio a meio" : `Divisão padrão ${d.config.defaultSplitPercentA}/${100 - d.config.defaultSplitPercentA}`, split: { type: "SHARED_DEFAULT" } },
    { key: "INDIVIDUAL_A", label: `Só ${first("USER_A")}`, split: { type: "INDIVIDUAL_A" } },
    { key: "INDIVIDUAL_B", label: `Só ${first("USER_B")}`, split: { type: "INDIVIDUAL_B" } },
    { key: "SHARED_CUSTOM", label: "Outra divisão", split: { type: "SHARED_CUSTOM", percentA: s.percentA ?? 70 } },
  ];
  const pA = s.type === "SHARED_CUSTOM" ? (s.percentA ?? 50) : 50;

  return (
    <li
      className={cn(
        "rounded-2xl border transition",
        open ? "border-zinc-900" : pred ? "border-dashed border-amber-300 bg-amber-50/40" : "border-[#ebebef]",
      )}
    >
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left">
        <MerchantLogo name={tx.description} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold">{tx.description}</span>
            {sub && <Repeat className="size-3.5 shrink-0 text-[#4f52d6]" aria-label="Assinatura" />}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 font-semibold text-zinc-800">
              <span className="size-2 rounded-full" style={{ background: cat.color }} />
              {cat.label}
              <ChevronDown className="size-3" />
            </span>
            <span className="truncate">{card}</span>
            {tx.installment && tx.installment.total > 1 && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-[#4f52d6]">
                Parcela {tx.installment.current} de {tx.installment.total}
              </span>
            )}
            {tx.toReview && !pred && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">Nova · conferir</span>}
            {tx.question && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
                  tx.question.answer ? "bg-zinc-100 text-zinc-700" : "bg-violet-100 text-violet-800",
                )}
              >
                <MessageCircleQuestion className="size-3" /> {tx.question.answer ? "Respondida" : tx.question.by === me ? "Você perguntou" : `${first(tx.question.by)} perguntou`}
              </span>
            )}
            {pred && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">Prevista · repete todo mês</span>}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={cn("tabular text-[15px] font-bold", tx.amount < 0 && "text-emerald-600")}>{fmtMoney(tx.amount)}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", badge.cls)} style={{ background: badge.bg }}>
            {shareLabel}
          </span>
        </span>
      </button>

      {open && (
        <fieldset disabled={readOnly} className="space-y-4 border-t border-zinc-100 px-3 pt-3 pb-3 disabled:opacity-60 sm:px-4">
          <div>
            <p className="mb-2 text-sm text-zinc-600">De quem é essa compra?</p>
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-zinc-100 p-1 sm:grid-cols-4">
              {who.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  onClick={() => s.type !== w.key && onChange({ ...tx, split: w.split })}
                  className={cn(
                    "h-10 min-w-0 truncate rounded-xl px-2 text-sm font-semibold transition",
                    s.type === w.key ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-white",
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
            {s.type === "SHARED_CUSTOM" && (
              <div className="mt-2 rounded-2xl bg-zinc-50 p-3">
                <div className="mb-1 flex justify-between text-xs font-semibold">
                  <span style={{ color: PERSON.USER_A.bg }}>
                    {first("USER_A")} {pA}%
                  </span>
                  <span className="text-emerald-700">
                    {first("USER_B")} {100 - pA}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  defaultValue={pA}
                  key={tx.id + pA}
                  onPointerUp={(e) => onChange({ ...tx, split: { type: "SHARED_CUSTOM", percentA: Number((e.target as HTMLInputElement).value) } })}
                  onKeyUp={(e) => onChange({ ...tx, split: { type: "SHARED_CUSTOM", percentA: Number((e.target as HTMLInputElement).value) } })}
                  className="w-full accent-zinc-900"
                  aria-label={`Percentual de ${first("USER_A")}`}
                />
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm text-zinc-600">Categoria</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_IDS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => c !== tx.category && onChange({ ...tx, category: c })}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition",
                    c === tx.category ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                  )}
                >
                  <span className="size-2 rounded-full" style={{ background: CATEGORIES[c].color }} />
                  {CATEGORIES[c].label}
                </button>
              ))}
            </div>
          </div>

          {tx.toReview && !pred && (
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-sky-700 text-sm font-semibold text-white"
            >
              <Check className="size-4" /> Está certa assim
            </button>
          )}

          {!pred && <QuestionBox q={tx.question} me={me} partner={first(otherUser(me))} name={first} onAsk={onAsk} />}

          {!tx.installment && tx.amount > 0 && (
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold">Repete todo mês</span>
                <span className="block text-xs text-zinc-500">Aparece como prevista nas próximas faturas</span>
              </span>
              <Switch checked={repeats} onCheckedChange={onRepeat} />
            </label>
          )}
          {!pred && tx.amount > 0 && tx.merchantKey && tx.merchantKey !== "desconhecido" && (
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold">Sempre dividir esta loja</span>
                <span className="block text-xs text-zinc-500">
                  {alwaysSplit ? "As compras daqui chegam divididas, nas duas faturas" : "Sem isso, cada um paga o que comprou na própria fatura"}
                </span>
              </span>
              <Switch checked={alwaysSplit} onCheckedChange={onAlwaysSplit} />
            </label>
          )}
          {!pred && (
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold">Assinatura</span>
                <span className="block text-xs text-zinc-500">Entra nos alertas de cobrança repetida e aumento de preço</span>
              </span>
              <Switch checked={sub} onCheckedChange={onSub} />
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3">
            {saved ? (
              <p className="flex min-w-0 flex-1 items-start gap-1.5 text-sm font-semibold text-emerald-700">
                <Check className="mt-0.5 size-4 shrink-0" /> {saved}
              </p>
            ) : (
              <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 text-sm text-rose-600">
                <Trash2 className="size-4" /> {pred ? "Não prever mais" : "Remover compra"}
              </button>
            )}
            <button type="button" onClick={onToggle} className="text-sm font-semibold text-[#4f52d6] underline underline-offset-2">
              Fechar
            </button>
          </div>
        </fieldset>
      )}
    </li>
  );
}

/** "O que é isso?": um pergunta, o outro responde, dentro da própria compra. */
function QuestionBox({
  q,
  me,
  partner,
  name,
  onAsk,
}: {
  q?: PurchaseQuestion;
  me: "USER_A" | "USER_B";
  partner: string;
  name: (u: "USER_A" | "USER_B") => string;
  onAsk: (q: PurchaseQuestion | undefined) => void;
}) {
  const [text, setText] = useState("");
  const now = () => new Date().toISOString();
  const input = (placeholder: string, label: string, send: () => void) => (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) send();
        setText("");
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={280}
        placeholder={placeholder}
        className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400"
      />
      <button type="submit" disabled={!text.trim()} className="h-10 shrink-0 rounded-full bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-40">
        {label}
      </button>
    </form>
  );
  if (!q) {
    return (
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <MessageCircleQuestion className="size-4 text-violet-700" /> Perguntar para {partner}
        </p>
        {input("O que é isso?", "Perguntar", () => onAsk({ by: me, text: text.trim(), at: now() }))}
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-violet-50 p-3 text-sm">
      <p>
        <b>{q.by === me ? "Você" : name(q.by)}:</b> {q.text}
      </p>
      {q.answer ? (
        <p className="mt-1">
          <b>{q.answeredBy === me ? "Você" : name(q.answeredBy ?? otherUser(q.by))}:</b> {q.answer}
        </p>
      ) : q.by !== me ? (
        input("Responder", "Responder", () => onAsk({ ...q, answer: text.trim(), answeredBy: me, answeredAt: now() }))
      ) : (
        <p className="mt-1 text-xs text-zinc-500">Esperando {partner} responder.</p>
      )}
      <button type="button" onClick={() => onAsk(undefined)} className="mt-2 text-xs font-semibold text-violet-800 underline underline-offset-2">
        {q.answer ? "Resolvido, apagar conversa" : "Apagar pergunta"}
      </button>
    </div>
  );
}

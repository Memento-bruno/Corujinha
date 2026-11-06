"use client";

import { BookUser, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/domain/categories";
import type { CategoryId, HouseholdConfig, Split, SplitType } from "@/lib/domain/types";
import { merchantList } from "@/lib/engines/merchants";
import { Card, CardHeader } from "../ui/card";
import { IconBox } from "../ui/icon-box";
import { Select, inputClass } from "../ui/field";

/** Banco de fornecedores do casal: o que o app lembra de cada loja. Dá para corrigir ou esquecer. */
export function MerchantsCard({ cfg, set }: { cfg: HouseholdConfig; set: (fn: (c: HouseholdConfig) => HouseholdConfig) => void }) {
  const [q, setQ] = useState("");
  const a = cfg.users.USER_A.name.split(" ")[0];
  const b = cfg.users.USER_B.name.split(" ")[0];
  const all = merchantList(cfg);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? all.filter(({ key, rule }) => `${key} ${rule.name}`.toLowerCase().includes(n)) : all;
  }, [all, q]);

  const patch = (key: string, change: { category?: CategoryId | null; split?: Split | null }) =>
    set((c) => {
      const cur = c.merchantRules?.[key];
      if (!cur) return c;
      const next = { ...cur, updatedAt: new Date().toISOString() };
      if (change.category === null) delete next.category;
      else if (change.category) next.category = change.category;
      if (change.split === null) delete next.split;
      else if (change.split) next.split = change.split;
      return { ...c, merchantRules: { ...c.merchantRules, [key]: next } };
    });
  const forget = (key: string) =>
    set((c) => {
      const r = { ...c.merchantRules };
      delete r[key];
      return { ...c, merchantRules: r };
    });

  // "Só fulano" não vale mais na loja (cada um paga a sua fatura): aparece como "dono da fatura".
  const splitValue = (s?: Split) => (!s || s.type === "INDIVIDUAL_A" || s.type === "INDIVIDUAL_B" ? "" : s.type === "SHARED_CUSTOM" ? `C${s.percentA}` : s.type);
  const parseSplit = (v: string): Split | null =>
    !v ? null : v.startsWith("C") ? { type: "SHARED_CUSTOM", percentA: Number(v.slice(1)) } : { type: v as SplitType };
  const customs = [...new Set([60, 70, 80, ...all.map(({ rule }) => (rule.split?.type === "SHARED_CUSTOM" ? rule.split.percentA ?? 50 : 0)).filter(Boolean)])].sort();

  return (
    <Card id="fornecedores">
      <CardHeader
        icon={<IconBox><BookUser /></IconBox>}
        title="Fornecedores"
        subtitle="O que o app lembra de cada loja. Compra nova dela já chega assim."
      />
      {all.length === 0 ? (
        <p className="rounded-2xl bg-zinc-50 p-3 text-sm text-zinc-500">
          Ainda nenhum. Em Faturas, toque numa compra e mude a categoria ou ligue "Sempre dividir esta loja": o app guarda aqui e usa nas próximas.
        </p>
      ) : (
        <>
          {all.length > 6 && (
            <label className="relative mb-3 block">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-zinc-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar fornecedor" className={inputClass + " pl-10"} />
            </label>
          )}
          <ul className="divide-y divide-zinc-100">
            {list.map(({ key, rule }) => (
              <li key={key} className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_190px_210px_auto]">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{rule.name}</span>
                  <span className="block truncate text-[11px] text-zinc-500">{key}</span>
                </span>
                <button
                  onClick={() => forget(key)}
                  className="rounded-full p-2 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 sm:order-last"
                  aria-label={`Esquecer ${rule.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
                <Select
                  aria-label="Categoria"
                  className="h-10 text-[13px]"
                  value={rule.category ?? ""}
                  onChange={(e) => patch(key, { category: (e.target.value || null) as CategoryId | null })}
                >
                  <option value="">Categoria: automática</option>
                  {CATEGORY_IDS.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORIES[c].label}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Divisão" className="h-10 text-[13px]" value={splitValue(rule.split)} onChange={(e) => patch(key, { split: parseSplit(e.target.value) })}>
                  <option value="">Quem paga: dono da fatura</option>
                  <option value="SHARED_DEFAULT">Sempre dividir: {cfg.defaultSplitPercentA === 50 ? "meio a meio" : `${cfg.defaultSplitPercentA}/${100 - cfg.defaultSplitPercentA}`}</option>
                  {customs.map((p) => (
                    <option key={p} value={`C${p}`}>
                      Sempre dividir: {a} {p}% · {b} {100 - p}%
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-zinc-500">{all.length} fornecedor{all.length === 1 ? "" : "es"} guardado{all.length === 1 ? "" : "s"}. Vale para os dois.</p>
        </>
      )}
    </Card>
  );
}

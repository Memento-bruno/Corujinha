"use client";

import { FileSpreadsheet, FileText, FileUp, Loader2, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { useDerived, useFmt } from "@/lib/client/derived";
import { api, useStore } from "@/lib/client/store";
import type { ParseResult } from "@/lib/importers/types";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input, Label, Select } from "../ui/field";
import { IconBox } from "../ui/icon-box";
import { Switch } from "../ui/switch";

export function ImportTab() {
  const { setMonth, toast } = useStore();
  const d = useDerived();
  const [cardId, setCardId] = useState(d.config.cards[0]?.id ?? "");
  const [month, setTargetMonth] = useState(d.month);
  const [invert, setInvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const previewTotal = result?.rows.filter((_, i) => selected.has(i)).reduce((s, r) => s + r.amount, 0) ?? 0;
  const fmt = useFmt(previewTotal || 1);

  const onFile = async (file: File) => {
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("year", month.slice(0, 4));
      form.set("invertSign", String(invert));
      const r = await api<ParseResult>("/api/import/preview", { method: "POST", body: form });
      setResult(r);
      setSelected(new Set(r.rows.map((_, i) => i)));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const commit = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const rows = result.rows.filter((_, i) => selected.has(i));
      const r = await api<{ added: number; duplicates: number }>("/api/import/commit", {
        method: "POST",
        body: JSON.stringify({ cardId, month, source: result.format, rows }),
      });
      toast(`${r.added} lançamentos importados${r.duplicates ? ` (${r.duplicates} já existiam)` : ""}.`, "success");
      setResult(null);
      setMonth(month);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader icon={<IconBox><FileUp /></IconBox>} title="Importar fatura" subtitle="CSV, OFX ou PDF do app do banco" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label>Cartão</Label>
            <Select value={cardId} onChange={(e) => setCardId(e.target.value)}>
              {d.config.cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nickname} •{c.last4} ({d.users[c.owner].name.split(" ")[0]})
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <Label>Fatura do mês</Label>
            <Input type="month" value={month} onChange={(e) => e.target.value && setTargetMonth(e.target.value)} />
          </label>
        </div>
        <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3">
          <span>
            <span className="block text-sm font-semibold text-zinc-900">Inverter sinais (CSV)</span>
            <span className="block text-xs text-zinc-500">Use se o banco exporta gastos como valores negativos</span>
          </span>
          <Switch checked={invert} onCheckedChange={setInvert} />
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.ofx,.pdf,.txt,text/csv,application/pdf,application/x-ofx"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy || !cardId}
          className="mt-3 flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-zinc-500 transition hover:border-brand-400 hover:bg-brand-50/40 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-6 animate-spin text-brand-500" /> : <FileUp className="size-6 text-brand-500" />}
          <span className="font-semibold text-zinc-800">{busy ? "Lendo arquivo…" : "Escolher arquivo"}</span>
          <span className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1"><FileSpreadsheet className="size-3.5" /> CSV</span>
            <span className="inline-flex items-center gap-1"><FileText className="size-3.5" /> OFX</span>
            <span className="inline-flex items-center gap-1"><FileText className="size-3.5" /> PDF</span>
          </span>
        </button>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-zinc-400">
          <ShieldCheck className="mt-px size-3.5 shrink-0" />O arquivo é lido no seu servidor e não é enviado a terceiros. Pagamentos da própria fatura são ignorados automaticamente.
        </p>
      </Card>

      {result && (
        <Card>
          <CardHeader
            title={`Prévia · ${result.rows.length} lançamentos`}
            subtitle={`Formato ${result.format.toUpperCase()} · ${result.skipped.length} linhas ignoradas`}
            action={
              <Button size="sm" onClick={() => void commit()} disabled={busy || selected.size === 0}>
                Importar {selected.size}
              </Button>
            }
          />
          {result.warnings.map((w) => (
            <p key={w} className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{w}</p>
          ))}
          <div className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
            <span className="text-zinc-500">Total selecionado</span>
            <span className="tabular font-bold text-zinc-900">{fmt.privacy ? `${selected.size} itens` : fmt.money(previewTotal)}</span>
          </div>
          <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
            {result.rows.map((r, i) => (
              <li key={i} className="flex items-center gap-3 py-2">
                <Checkbox
                  checked={selected.has(i)}
                  onCheckedChange={(v) =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (v) n.add(i);
                      else n.delete(i);
                      return n;
                    })
                  }
                />
                <span className="tabular w-20 shrink-0 text-xs text-zinc-500">{r.date.split("-").reverse().join("/")}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">
                  {r.description}
                  {r.installment && <span className="ml-1 text-[10px] font-bold text-zinc-500">{r.installment.current}/{r.installment.total}</span>}
                </span>
                <span className={"tabular text-sm font-semibold " + (r.amount < 0 ? "text-emerald-600" : "text-zinc-900")}>
                  {fmt.privacy ? fmt.money(r.amount, previewTotal) : fmt.money(r.amount)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="rounded-2xl bg-slate-50/70">
        <p className="text-xs leading-relaxed text-zinc-500">
          <b className="text-zinc-700">Open Finance (Pluggy)</b> chega na Fase 3: a leitura automática das faturas, somente leitura.
          Até lá, exporte a fatura no app do banco (Nubank: CSV; Itaú/Inter/C6: OFX ou PDF) e importe aqui.
        </p>
      </Card>
    </div>
  );
}

"use client";

import { Bug, Copy, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, useStore } from "@/lib/client/store";
import type { HouseholdConfig } from "@/lib/domain/types";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { IconBox } from "../ui/icon-box";

interface ErrorEntry {
  at: string;
  lastAt: string;
  count: number;
  where: "tela" | "servidor";
  user?: "USER_A" | "USER_B";
  message: string;
  path?: string;
  detail?: string;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Texto para colar na conversa com o Claude: só mensagem, lugar e quando. Nenhum valor. */
export function errorsReport(entries: ErrorEntry[], cfg: HouseholdConfig): string {
  const lines = entries.map((e) => {
    const who = e.user ? cfg.users[e.user].name.split(" ")[0] : e.where === "servidor" ? "servidor" : "?";
    const times = e.count > 1 ? ` (${e.count}x, última ${when(e.lastAt)})` : "";
    const detail = e.detail ? `\n    ${e.detail.replace(/\n/g, "\n    ")}` : "";
    return `- ${when(e.at)}${times} · ${e.where} · ${who} · ${e.path ?? "-"}\n  ${e.message}${detail}`;
  });
  return `Erros do Corujinha (${entries.length}):\n${lines.join("\n")}`;
}

/**
 * Erros do app: o que quebrou na tela de alguém ou no servidor fica guardado aqui (criptografado
 * no Drive). Dá para copiar e mandar para correção, e limpar depois.
 */
export function ErrorsCard({ cfg }: { cfg: HouseholdConfig }) {
  const { toast } = useStore();
  const [list, setList] = useState<ErrorEntry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList((await api<{ entries: ErrorEntry[] }>("/api/erros")).entries);
    } catch {
      setList([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async () => {
    if (!list?.length) return;
    try {
      await navigator.clipboard.writeText(errorsReport(list, cfg));
      toast("Erros copiados. Cole na conversa para corrigir.", "success");
    } catch {
      toast("Não consegui copiar neste aparelho.", "error");
    }
  };

  const clear = async () => {
    if (!window.confirm("Limpar a lista de erros?")) return;
    setBusy(true);
    try {
      await api("/api/erros", { method: "DELETE" });
      setList([]);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="erros">
      <CardHeader icon={<IconBox><Bug /></IconBox>} title="Erros do app" subtitle="O que deu errado, para mandar corrigir" />
      {list === null ? (
        <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="size-4 animate-spin" /> Carregando…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum erro registrado. 🎉</p>
      ) : (
        <>
          <ul className="divide-y divide-zinc-100 text-sm">
            {list.slice(0, 10).map((e) => {
              const key = `${e.at}|${e.message}`;
              const who = e.user ? cfg.users[e.user].name.split(" ")[0] : "servidor";
              return (
                <li key={key} className="py-2">
                  <button type="button" className="w-full text-left" onClick={() => setOpen(open === key ? null : key)}>
                    <span className="line-clamp-2 font-medium text-zinc-900">{e.message}</span>
                    <span className="text-xs text-zinc-500">
                      {when(e.lastAt)} · {who}
                      {e.path ? ` · ${e.path}` : ""}
                      {e.count > 1 ? ` · ${e.count} vezes` : ""}
                    </span>
                  </button>
                  {open === key && e.detail && (
                    <pre className="mt-1 max-h-40 overflow-auto rounded-xl bg-zinc-50 p-2 text-[11px] whitespace-pre-wrap text-zinc-600">{e.detail}</pre>
                  )}
                </li>
              );
            })}
          </ul>
          {list.length > 10 && <p className="mt-1 text-xs text-zinc-500">E mais {list.length - 10} (vão juntos ao copiar).</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void copy()}><Copy /> Copiar erros</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void clear()}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Limpar
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

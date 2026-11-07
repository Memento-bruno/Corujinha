"use client";

import { History, Loader2, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, useStore } from "@/lib/client/store";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { IconBox } from "../ui/icon-box";

interface BackupInfo {
  name: string;
  createdAt: string;
  reason: string;
}

const REASONS: Record<string, string> = {
  manual: "Feita por vocês",
  automatica: "Automática da semana",
  "antes-de-apagar-compras-do-banco": "Antes de apagar as compras do banco",
  "antes-de-desconectar-banco": "Antes de desconectar um banco",
  "antes-de-restaurar": "Antes de restaurar uma cópia",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Cópias de segurança: o app guarda uma cópia de tudo antes de apagar compras em massa.
 * Dá para fazer uma na hora e voltar para qualquer uma (antes de voltar, o estado atual também é guardado).
 */
export function BackupsCard() {
  const { reload, toast } = useStore();
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList((await api<{ backups: BackupInfo[] }>("/api/backups")).backups);
    } catch {
      setList([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy("create");
    try {
      await api("/api/backups", { method: "POST", body: JSON.stringify({ action: "create" }) });
      toast("Cópia de segurança guardada.", "success");
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (b: BackupInfo) => {
    if (!window.confirm(`Voltar todos os dados para como estavam em ${when(b.createdAt)}? O que mudou depois disso sai do app (antes, o app guarda uma cópia de como está agora).`)) return;
    setBusy(b.name);
    try {
      const r = await api<{ files: number }>("/api/backups", { method: "POST", body: JSON.stringify({ action: "restore", name: b.name }) });
      toast(`Dados restaurados (${r.files} arquivo${r.files === 1 ? "" : "s"}).`, "success");
      await reload();
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card id="copias">
      <CardHeader icon={<IconBox><History /></IconBox>} title="Cópias de segurança" subtitle="Guardadas criptografadas na pasta do Drive" />
      <p className="mb-3 text-xs text-zinc-500">
        O app faz uma cópia sozinho toda semana e antes de apagar ou desconectar compras do banco. Ficam as 15 mais recentes.
      </p>
      {list === null ? (
        <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="size-4 animate-spin" /> Carregando…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhuma cópia ainda.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm">
          {list.map((b) => (
            <li key={b.name} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <b className="block">{when(b.createdAt)}</b>
                <span className="text-xs text-zinc-500">{REASONS[b.reason] ?? b.reason}</span>
              </span>
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void restore(b)}>
                {busy === b.name ? <Loader2 className="animate-spin" /> : <RotateCcw />} Voltar
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void create()}>
          {busy === "create" ? <Loader2 className="animate-spin" /> : <Save />} Fazer cópia agora
        </Button>
      </div>
    </Card>
  );
}

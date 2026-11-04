"use client";

import { Landmark, Link2, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { openPluggyConnect } from "@/lib/client/pluggy-connect";
import { useStore } from "@/lib/client/store";
import type { HouseholdConfig, UserId } from "@/lib/domain/types";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Input, Label, Select } from "../ui/field";
import { IconBox } from "../ui/icon-box";

const ITEM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatWhen(iso?: string): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Conexões Open Finance via Meu Pluggy: só leitura das faturas de cartão. */
export function OpenFinanceCard({ config }: { config: HouseholdConfig }) {
  const { state, updateConfig, syncBank, bankSyncing, toast } = useStore();
  const [itemId, setItemId] = useState("");
  const [owner, setOwner] = useState<UserId>(state!.viewer.userId);
  const [connecting, setConnecting] = useState(false);
  const items = config.pluggyItems ?? [];
  const configured = state!.mode.pluggyConfigured;
  const valid = ITEM_ID.test(itemId.trim());

  const saveItem = async (raw: string) => {
    const id = raw.trim().toLowerCase();
    if (!ITEM_ID.test(id)) return false;
    if (items.some((i) => i.itemId === id)) return false;
    await updateConfig((c) =>
      (c.pluggyItems ?? []).some((i) => i.itemId === id) ? c : { ...c, pluggyItems: [...(c.pluggyItems ?? []), { itemId: id, owner }] },
    );
    return true;
  };

  const add = async () => {
    if (items.some((i) => i.itemId === itemId.trim().toLowerCase())) {
      toast("Essa conexão já está cadastrada.", "info");
      return;
    }
    if (await saveItem(itemId)) setItemId("");
  };

  const connect = async (existing?: string) => {
    setConnecting(true);
    try {
      await openPluggyConnect({
        itemId: existing,
        onSuccess: async (id) => {
          if (!existing) await saveItem(id);
          toast(existing ? "Conexão renovada. Buscando as compras…" : "Banco conectado. Buscando as compras…", "success");
          await syncBank();
        },
        onError: (message) => toast(message, "error"),
      });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Card id="open-finance">
      <CardHeader
        icon={<IconBox><Landmark /></IconBox>}
        title="Open Finance"
        subtitle="Compras dos cartões direto do banco, via Meu Pluggy. Somente leitura."
      />

      {state!.mode.pluggyNeedsLogin ? (
        <p className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
          Bloqueado por segurança: o app está publicado sem login. Configure o login com Google antes de conectar o banco, para que só vocês dois vejam os cartões.
        </p>
      ) : !configured ? (
        <p className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
          Falta configurar <b>PLUGGY_CLIENT_ID</b> e <b>PLUGGY_CLIENT_SECRET</b> no servidor (<code>.env.local</code> ou variáveis da Vercel). Depois reinicie o app.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-zinc-500">
            Última sincronização: <b className="text-zinc-700">{formatWhen(config.pluggyLastSyncAt)}</b>. O app também sincroniza sozinho ao abrir, a cada 6h. Compras que vocês já editaram não são alteradas, e meses fechados ficam como estão.
          </p>
          {items.length > 0 && (
            <ul className="mb-3 space-y-2">
              {items.map((i) => (
                <li key={i.itemId} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <b>{config.users[i.owner].name}</b>
                    <span className="ml-2 font-mono text-xs text-zinc-500">{i.itemId.slice(0, 8)}…</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                  <button
                    className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600"
                    disabled={connecting}
                    onClick={() => void connect(i.itemId)}
                    title="Use se o banco pedir para autorizar de novo"
                  >
                    <Link2 className="size-3.5" /> Reconectar
                  </button>
                  <button
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"
                    onClick={() => void updateConfig((c) => ({ ...c, pluggyItems: (c.pluggyItems ?? []).filter((x) => x.itemId !== i.itemId) }))}
                  >
                    <Trash2 className="size-3.5" /> Remover
                  </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 && (
            <a href="/api/pluggy/diagnostico" target="_blank" rel="noreferrer" className="mb-3 block text-center text-xs font-semibold text-brand-600 underline">
              Conferir valores com o banco
            </a>
          )}
          {items.length > 0 && (
            <Button className="mb-4 w-full" disabled={bankSyncing} onClick={() => void syncBank()}>
              {bankSyncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sincronizar agora
            </Button>
          )}
          <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
            <label className="block">
              <Label>Cartões de</Label>
              <Select value={owner} onChange={(e) => setOwner(e.target.value as UserId)}>
                <option value="USER_A">{config.users.USER_A.name}</option>
                <option value="USER_B">{config.users.USER_B.name}</option>
              </Select>
            </label>
            <Button variant={items.length ? "outline" : "default"} disabled={connecting} onClick={() => void connect()}>
              {connecting ? <Loader2 className="animate-spin" /> : <Plus />} Conectar banco
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            Abre a janela oficial da Pluggy. Escolha <b>MeuPluggy</b> e entre com a conta do Meu Pluggy onde seus cartões estão autorizados. A senha do banco nunca passa pelo Corujinha.
          </p>
          <details className="mt-3 text-xs text-zinc-500">
            <summary className="cursor-pointer font-semibold text-zinc-600">Já tenho o Item ID</summary>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
            >
              <Input className="min-w-0 flex-1" value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" spellCheck={false} autoComplete="off" aria-label="Item ID da conexão" />
              <Button type="submit" variant="outline" disabled={!valid}>Adicionar</Button>
            </form>
            <p className="mt-1.5">É o id da conexão no painel da Pluggy (não é o Client ID). Sozinho ele não dá acesso a nada.</p>
          </details>
        </>
      )}
    </Card>
  );
}

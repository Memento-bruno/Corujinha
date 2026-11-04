"use client";

import { Landmark, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
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
  const items = config.pluggyItems ?? [];
  const configured = state!.mode.pluggyConfigured;
  const valid = ITEM_ID.test(itemId.trim());

  const add = () => {
    const id = itemId.trim().toLowerCase();
    if (!ITEM_ID.test(id)) return;
    if (items.some((i) => i.itemId === id)) {
      toast("Essa conexão já está cadastrada.", "info");
      return;
    }
    void updateConfig((c) => ({ ...c, pluggyItems: [...(c.pluggyItems ?? []), { itemId: id, owner }] }));
    setItemId("");
  };

  return (
    <Card id="open-finance">
      <CardHeader
        icon={<IconBox><Landmark /></IconBox>}
        title="Open Finance"
        subtitle="Compras dos cartões direto do banco, via Meu Pluggy. Somente leitura."
      />

      {!configured ? (
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
                  <button
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"
                    onClick={() => void updateConfig((c) => ({ ...c, pluggyItems: (c.pluggyItems ?? []).filter((x) => x.itemId !== i.itemId) }))}
                  >
                    <Trash2 className="size-3.5" /> Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 && (
            <Button className="mb-4 w-full" disabled={bankSyncing} onClick={() => void syncBank()}>
              {bankSyncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sincronizar agora
            </Button>
          )}
          <form
            className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <label className="block min-w-0">
              <Label>Item ID da conexão</Label>
              <Input value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" spellCheck={false} autoComplete="off" />
            </label>
            <label className="block">
              <Label>Cartões de</Label>
              <Select value={owner} onChange={(e) => setOwner(e.target.value as UserId)}>
                <option value="USER_A">{config.users.USER_A.name}</option>
                <option value="USER_B">{config.users.USER_B.name}</option>
              </Select>
            </label>
            <Button type="submit" variant="outline" disabled={!valid}><Plus /> Adicionar</Button>
          </form>
          <p className="mt-2 text-[11px] text-zinc-500">
            O Item ID aparece no painel da Pluggy depois de conectar o Meu Pluggy. Sozinho ele não dá acesso a nada: o segredo fica só no servidor.
          </p>
        </>
      )}
    </Card>
  );
}

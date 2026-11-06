"use client";

import { CalendarCheck, Lock, RotateCcw } from "lucide-react";
import { useState } from "react";
import { api, useStore } from "@/lib/client/store";
import { closingLabel } from "@/lib/domain/closing";
import type { HouseholdConfig } from "@/lib/domain/types";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Input, Label } from "../ui/field";
import { IconBox } from "../ui/icon-box";
import { Sheet } from "../ui/sheet";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Grava (ou desfaz) o fechamento por data no servidor e recarrega tudo. */
export function useClosingActions() {
  const { reload, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const run = async (date: string | null) => {
    setBusy(true);
    try {
      await api("/api/fechamento", date ? { method: "POST", body: JSON.stringify({ date }) } : { method: "DELETE" });
      await reload();
      toast(date ? "Fechado. O app agora só conta o que veio depois dessa data." : "Fechamento desfeito: tudo voltou a contar.", "success");
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, close: (date: string) => run(date), undo: () => run(null) };
}

/**
 * Modo fechamento: o casal diz até que dia já está tudo acertado.
 * Compras até essa data ficam travadas (sem editar, sem sincronizar de novo) e o app só olha dali em diante.
 */
export function ClosingCard({ cfg }: { cfg: HouseholdConfig }) {
  const { busy, close, undo } = useClosingActions();
  const [date, setDate] = useState(cfg.closing?.date ?? today());
  const [confirm, setConfirm] = useState(false);
  const c = cfg.closing;
  return (
    <Card id="fechamento">
      <CardHeader icon={<IconBox><CalendarCheck /></IconBox>} title="Fechamento por data" subtitle="Até que dia vocês já acertaram as contas" />
      {c ? (
        <p className="mb-3 flex items-start gap-2 rounded-2xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            Tudo até <b>{closingLabel(c)}</b> está fechado. Essas compras não mudam, o banco não mexe mais nelas e elas não entram nas contas.
            Fechado por {cfg.users[c.closedBy].name.split(" ")[0]}.
          </span>
        </p>
      ) : (
        <p className="mb-3 rounded-2xl bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-600">
          Escolha o dia do último acerto entre vocês. Tudo até esse dia (inclusive) fica fechado e o app passa a contar só o que vier depois.
        </p>
      )}
      <label className="block">
        <Label>{c ? "Mudar a data" : "Último acerto feito em"}</Label>
        <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !date || date === c?.date} onClick={() => setConfirm(true)}>
          <Lock /> Fechar até esta data
        </Button>
        {c && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void undo()}>
            <RotateCcw /> Desfazer fechamento
          </Button>
        )}
      </div>
      <Sheet
        open={confirm}
        onOpenChange={setConfirm}
        title={date ? `Fechar até ${closingLabel({ date })}?` : "Fechar?"}
        description="Nada é apagado e dá para desfazer depois."
      >
        <ul className="mb-4 list-disc space-y-1.5 pl-5 text-sm text-zinc-700">
          <li>Compras até esse dia ficam travadas: ninguém edita e o banco não mexe mais nelas.</li>
          <li>Elas saem das contas: totais, acerto e gráficos só olham dali em diante.</li>
          <li>Parcela que cai numa fatura de um mês depois dessa data continua contando.</li>
          <li>Contas fora do cartão contam só as que vencem depois dessa data.</li>
        </ul>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setConfirm(false)}>
            Cancelar
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => void close(date).then((ok) => ok && setConfirm(false))}>
            Fechar
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}

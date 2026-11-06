"use client";

import { useHeaderZoom } from "@/lib/client/use-desktop-viewport";
import { useStore } from "@/lib/client/store";
import { Logo } from "../brand/logo";
import { MonthStrip } from "./month-strip";
import { PersonFilter } from "./person-filter";
import { SyncBadge } from "./sync-badge";
import { ValueMode } from "./value-mode";

/** Topo: logo, faixa de meses, de quem mostrar (casal ou um dos dois) e formato dos valores. */
export function Header() {
  const { state, sync } = useStore();
  // No celular (tela encolhida) o topo cresce um pouco para os botões caberem no dedo.
  const zoom = useHeaderZoom();
  if (!state) return null;
  const me = state.config.data.users[state.viewer.userId];
  return (
    <header className="flex flex-col gap-3 pt-4 pb-5" style={zoom !== 1 ? { zoom } : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Logo size={52} />
          <div className="min-w-0">
            <div className="text-lg leading-tight font-bold text-zinc-900">Corujinha</div>
            <div className="truncate text-[13px] text-zinc-600">Olá, {me.name.split(" ")[0]}</div>
            {sync !== "synced" && <SyncBadge className="mt-0.5" />}
          </div>
        </div>
        {/* Faixa de meses sempre na sua própria linha: no computador, ao lado do logo, ela ficava
            cortada (meses pela metade e o botão "Hoje" escondido). */}
        <div className="order-3 w-full min-w-0">
          <div className="flex justify-center">
            <MonthStrip />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PersonFilter />
          <ValueMode />
        </div>
      </div>
    </header>
  );
}

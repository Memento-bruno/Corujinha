"use client";

import { useStore } from "@/lib/client/store";
import { Logo } from "../brand/logo";
import { MonthStrip } from "./month-strip";
import { SyncBadge } from "./sync-badge";
import { ValueMode } from "./value-mode";

/** Topo: logo, faixa de meses e formato dos valores na mesma linha. */
export function Header() {
  const { state, sync } = useStore();
  if (!state) return null;
  const me = state.config.data.users[state.viewer.userId];
  return (
    <header className="flex flex-col gap-3 pt-4 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-3 lg:flex-nowrap">
        <div className="flex min-w-0 items-center gap-3">
          <Logo size={52} />
          <div className="min-w-0">
            <div className="text-lg leading-tight font-bold text-zinc-900">Corujinha</div>
            <div className="truncate text-[13px] text-zinc-600">Olá, {me.name.split(" ")[0]}</div>
            {sync !== "synced" && <SyncBadge className="mt-0.5" />}
          </div>
        </div>
        <div className="order-3 w-full min-w-0 lg:order-none lg:w-auto lg:flex-1 lg:px-2">
          <div className="flex justify-center">
            <MonthStrip />
          </div>
        </div>
        <ValueMode />
      </div>
    </header>
  );
}

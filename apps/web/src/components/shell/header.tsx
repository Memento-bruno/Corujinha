"use client";

import { Eye, EyeOff, Settings2 } from "lucide-react";
import Link from "next/link";
import { useStore } from "@/lib/client/store";
import { otherUser } from "@/lib/domain/types";
import { Avatar } from "./avatar";
import { SyncBadge } from "./sync-badge";

export function Header() {
  const { state, privacy, setPrivacy } = useStore();
  if (!state) return null;
  const me = state.config.data.users[state.viewer.userId];
  const partner = state.config.data.users[otherUser(state.viewer.userId)];
  return (
    <header className="flex items-center justify-between gap-3 pt-4 pb-2">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/ajustes"
          aria-label="Ajustes"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white text-zinc-700 shadow-soft"
        >
          <Settings2 className="size-[18px]" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-zinc-900">Olá, {me.name.split(" ")[0]}</h1>
          <SyncBadge className="mt-0.5 sm:hidden" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <SyncBadge className="hidden sm:inline-flex" />
        <button
          onClick={() => setPrivacy(!privacy)}
          aria-pressed={privacy}
          className={
            "inline-flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-xs font-bold shadow-soft transition " +
            (privacy ? "border-zinc-900 bg-zinc-900 text-white" : "border-slate-200/80 bg-white text-zinc-700")
          }
          title="Modo Privacidade: mostra apenas percentuais"
        >
          {privacy ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {privacy ? "%" : "R$"}
        </button>
        <div className="flex items-center rounded-2xl border border-slate-200/80 bg-white p-1 shadow-soft">
          <Avatar user={me} size={32} image={state.viewer.image} />
          <Avatar user={partner} size={32} className="-ml-2" />
        </div>
      </div>
    </header>
  );
}

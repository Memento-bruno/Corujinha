"use client";

import { useStore } from "@/lib/client/store";
import type { ViewFilter } from "@/lib/engines/analytics";
import { cn } from "@/lib/utils";

/** Mostrar o casal ou só uma pessoa: vale para todas as telas (cartões e contas de quem foi escolhido). */
export function PersonFilter() {
  const { state, view, setView } = useStore();
  if (!state) return null;
  const users = state.config.data.users;
  const opts: { value: ViewFilter; label: string }[] = [
    { value: "COUPLE", label: "Casal" },
    { value: "USER_A", label: users.USER_A.name.split(" ")[0] },
    { value: "USER_B", label: users.USER_B.name.split(" ")[0] },
  ];
  return (
    <div role="group" aria-label="Mostrar de quem" className="inline-flex shrink-0 gap-1 rounded-full border border-zinc-200 bg-white p-1">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={view === o.value}
          onClick={() => setView(o.value)}
          className={cn(
            "h-10 rounded-full px-3.5 text-sm font-semibold transition",
            view === o.value ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

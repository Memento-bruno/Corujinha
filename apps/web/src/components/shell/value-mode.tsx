"use client";

import { Eye, EyeOff } from "lucide-react";
import { useStore } from "@/lib/client/store";
import { cn } from "@/lib/utils";

/** Como mostrar os valores, só com ícones: completo, em 10³ com 2 casas, ou escondido (só porcentagens). */
export function ValueMode() {
  const { privacy, setPrivacy, sci, setSci } = useStore();
  const mode = privacy ? "hide" : sci ? "sci" : "full";
  const btn = (on: boolean) =>
    cn("inline-flex size-10 items-center justify-center rounded-full transition", on ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100");
  return (
    <div role="group" aria-label="Como mostrar os valores" className="inline-flex shrink-0 gap-1 rounded-full border border-zinc-200 bg-white p-1">
      <button type="button" aria-pressed={mode === "full"} aria-label="Valor completo (R$ 2.536)" title="Valor completo (R$ 2.536)" className={btn(mode === "full")} onClick={() => { setPrivacy(false); setSci(false); }}>
        <Eye className="size-[18px]" />
      </button>
      <button type="button" aria-pressed={mode === "sci"} aria-label="Valores em 10³ (R$ 2,54×10³)" title="Valores em 10³ (R$ 2,54×10³)" className={btn(mode === "sci")} onClick={() => { setPrivacy(false); setSci(true); }}>
        <span className="text-[13px] leading-none font-extrabold" aria-hidden>
          10<sup className="text-[9px]">3</sup>
        </span>
      </button>
      <button type="button" aria-pressed={mode === "hide"} aria-label="Esconder valores, mostrar só porcentagens" title="Esconder valores (só %)" className={btn(mode === "hide")} onClick={() => setPrivacy(true)}>
        <EyeOff className="size-[18px]" />
      </button>
    </div>
  );
}

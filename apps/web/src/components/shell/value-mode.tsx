"use client";

import { ArrowUp, Eye, EyeOff, Shuffle } from "lucide-react";
import { useStore } from "@/lib/client/store";
import { cn } from "@/lib/utils";

/** Como mostrar os valores, só com ícones: completo, em milhares com 2 casas (seta pra cima), ou escondido (só porcentagens). */
export function ValueMode() {
  const { privacy, setPrivacy, sci, setSci, fake, setFake } = useStore();
  const mode = privacy ? "hide" : sci ? "sci" : "full";
  const btn = (on: boolean) =>
    cn("inline-flex size-10 items-center justify-center rounded-full transition", on ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100");
  return (
    <div role="group" aria-label="Como mostrar os valores" className="relative inline-flex shrink-0 gap-1 rounded-full border border-zinc-200 bg-white p-1">
      <button type="button" aria-pressed={mode === "full"} aria-label="Valor completo (R$ 2.536)" title="Valor completo (R$ 2.536)" className={btn(mode === "full")} onClick={() => { setPrivacy(false); setSci(false); }}>
        <Eye className="size-[18px]" />
      </button>
      <button type="button" aria-pressed={mode === "sci"} aria-label="Valores em milhares (R$ 4.260 vira R$ 4,26)" title="Valores em milhares (R$ 4.260 vira R$ 4,26)" className={btn(mode === "sci")} onClick={() => { setPrivacy(false); setSci(true); }}>
        <ArrowUp className="size-[18px]" strokeWidth={2.5} />
      </button>
      <button type="button" aria-pressed={mode === "hide"} aria-label="Esconder valores, mostrar só porcentagens" title="Esconder valores (só %)" className={btn(mode === "hide")} onClick={() => setPrivacy(true)}>
        <EyeOff className="size-[18px]" />
      </button>
      {/* Só aparece com os valores fictícios ligados (liga em Ajustes): lembra que não são os reais e desliga com um toque. */}
      {fake && (
        <button
          type="button"
          aria-label="Valores fictícios ligados. Toque para mostrar os reais"
          title="Valores fictícios ligados (toque para desligar)"
          className="absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-violet-600 text-white shadow ring-2 ring-white"
          onClick={() => setFake(false)}
        >
          <Shuffle className="size-3" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

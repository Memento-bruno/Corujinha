"use client";

import type { HouseholdConfig, Split, SplitType } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** Seletor das 4 regras de divisão + percentual customizado. */
export function SplitEditor({ value, onChange, cfg }: { value: Split; onChange: (s: Split) => void; cfg: HouseholdConfig }) {
  const a = cfg.users.USER_A.name.split(" ")[0];
  const b = cfg.users.USER_B.name.split(" ")[0];
  const options: { type: SplitType; label: string; hint: string }[] = [
    { type: "SHARED_DEFAULT", label: "Divisão padrão", hint: `${cfg.defaultSplitPercentA}% ${a} · ${100 - cfg.defaultSplitPercentA}% ${b}` },
    { type: "SHARED_CUSTOM", label: "Personalizada", hint: "Escolha o percentual" },
    { type: "INDIVIDUAL_A", label: `Só ${a}`, hint: `100% de ${a}` },
    { type: "INDIVIDUAL_B", label: `Só ${b}`, hint: `100% de ${b}` },
  ];
  const pA = value.type === "SHARED_CUSTOM" ? (value.percentA ?? 50) : 50;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <button
            key={o.type}
            type="button"
            onClick={() => onChange(o.type === "SHARED_CUSTOM" ? { type: o.type, percentA: value.percentA ?? 70 } : { type: o.type })}
            className={cn(
              "rounded-2xl border p-3 text-left transition",
              value.type === o.type ? "border-zinc-900 bg-zinc-900 text-white" : "border-slate-200 bg-white hover:bg-slate-50",
            )}
          >
            <span className="block text-sm font-semibold">{o.label}</span>
            <span className={cn("block text-[11px]", value.type === o.type ? "text-zinc-300" : "text-zinc-500")}>{o.hint}</span>
          </button>
        ))}
      </div>
      {value.type === "SHARED_CUSTOM" && (
        <div className="mt-3 rounded-2xl bg-slate-50 p-3">
          <div className="mb-2 flex justify-between text-xs font-semibold">
            <span className="text-brand-600">
              {a} {pA}%
            </span>
            <span className="text-emerald-600">
              {b} {100 - pA}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={pA}
            onChange={(e) => onChange({ type: "SHARED_CUSTOM", percentA: Number(e.target.value) })}
            className="w-full accent-zinc-900"
            aria-label={`Percentual de ${a}`}
          />
        </div>
      )}
    </div>
  );
}

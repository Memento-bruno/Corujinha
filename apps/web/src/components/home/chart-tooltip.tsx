"use client";

/** Tooltip escuro flutuante (estilo das referências). */
export function DarkTooltip({
  active,
  title,
  rows,
}: {
  active?: boolean;
  title?: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  if (!active || rows.length === 0) return null;
  return (
    <div className="rounded-lg bg-zinc-900 px-3 py-2 text-center text-white shadow-float">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-center gap-1.5 text-xs font-semibold tabular">
          {r.color && <span className="size-1.5 rounded-full" style={{ background: r.color }} />}
          <span className="font-normal text-zinc-400">{r.label}</span>
          {r.value}
        </div>
      ))}
      {title && <div className="mt-0.5 text-[10px] text-zinc-400">{title}</div>}
    </div>
  );
}

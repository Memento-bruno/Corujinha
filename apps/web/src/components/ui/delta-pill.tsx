import { ArrowDown, ArrowUp } from "lucide-react";
import { formatPct } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

/**
 * Variação mensal. Para GASTOS, reduzir é bom (verde) e aumentar é ruim (coral).
 * `goodWhenUp` inverte a lógica quando um aumento é positivo.
 */
export function DeltaPill({
  value,
  goodWhenUp = false,
  suffix = "vs. mês anterior",
  className,
}: {
  value: number | null;
  goodWhenUp?: boolean;
  suffix?: string | null;
  className?: string;
}) {
  if (value === null || !Number.isFinite(value)) {
    return <span className={cn("text-[11px] text-zinc-400", className)}>sem mês anterior</span>;
  }
  const up = value > 0;
  const good = up === goodWhenUp || Math.abs(value) < 0.05;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px]", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full py-0.5 pr-1.5 pl-0.5 font-semibold tabular",
          good ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600",
        )}
      >
        <span className={cn("inline-flex size-3.5 items-center justify-center rounded-full text-white", good ? "bg-emerald-500" : "bg-rose-500")}>
          {up ? <ArrowUp className="size-2.5" strokeWidth={3} /> : <ArrowDown className="size-2.5" strokeWidth={3} />}
        </span>
        {formatPct(Math.abs(value))}
      </span>
      {suffix && <span className="text-zinc-400">{suffix}</span>}
    </span>
  );
}

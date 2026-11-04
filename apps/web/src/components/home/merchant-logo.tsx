import { cn } from "@/lib/utils";

const PALETTE = ["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6"];

/** Bloco com a inicial do estabelecimento (não usamos logos de marcas). */
export function MerchantLogo({ name, className }: { name: string; className?: string }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const color = PALETTE[h % PALETTE.length];
  return (
    <span
      className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-slate-100 text-sm font-bold", className)}
      style={{ background: `${color}14`, color }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

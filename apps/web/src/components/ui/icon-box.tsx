import { cn } from "@/lib/utils";

/** Ícone dentro de um quadradinho com borda, como nos cards das referências. */
export function IconBox({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-zinc-700 shadow-soft [&_svg]:size-4",
        className,
      )}
    >
      {children}
    </span>
  );
}

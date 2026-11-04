import { Nfc, Sparkle } from "lucide-react";
import type { CreditCard } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const CARD_THEMES = [
  "linear-gradient(115deg, #7468f0 0%, #8fa6f7 28%, #9fd7f2 55%, #c4f1b8 80%, #eef7a6 100%)",
  "linear-gradient(115deg, #a78bfa 0%, #93c5fd 40%, #a7f3d0 75%, #fde68a 100%)",
  "linear-gradient(115deg, #f0abfc 0%, #c4b5fd 35%, #93c5fd 70%, #99f6e4 100%)",
  "linear-gradient(115deg, #6366f1 0%, #60a5fa 35%, #5eead4 70%, #d9f99d 100%)",
];

function BrandMark({ brand }: { brand: CreditCard["brand"] }) {
  if (brand === "mastercard") {
    return (
      <span className="flex items-center" aria-label="Mastercard">
        <span className="size-6 rounded-full bg-zinc-900/85" />
        <span className="-ml-2.5 size-6 rounded-full bg-zinc-900/45" />
      </span>
    );
  }
  return <span className="text-sm font-black tracking-wider text-zinc-900/80 uppercase italic">{brand === "outra" ? "" : brand}</span>;
}

/** Cartão holográfico pastel — só exibe os 4 últimos dígitos. */
export function CreditCardVisual({
  card,
  ownerName,
  className,
  selected,
  compact,
}: {
  card: CreditCard;
  ownerName: string;
  className?: string;
  selected?: boolean;
  /** Versão pequena (celular, dois por linha). */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "holo relative aspect-[1.7/1] w-full overflow-hidden rounded-3xl p-4 text-zinc-900 shadow-soft transition sm:p-5",
        compact && "rounded-2xl p-2.5 sm:p-3.5 [&_.cc-bottom]:p-2.5 sm:[&_.cc-bottom]:p-3.5 [&_.cc-num]:text-[11px] sm:[&_.cc-num]:text-sm [&_.cc-chip]:hidden [&_.cc-top_svg]:size-4",
        selected && "ring-2 ring-zinc-900 ring-offset-2",
        className,
      )}
      style={{ background: CARD_THEMES[card.theme % CARD_THEMES.length] }}
    >
      <div className="cc-top flex items-start justify-between">
        <Sparkle className="size-7 text-zinc-900" strokeWidth={1.4} />
        <div className="flex items-center gap-3">
          <Nfc className="size-4 text-zinc-900/60" />
          <BrandMark brand={card.brand} />
        </div>
      </div>
      <div className="cc-bottom absolute inset-x-0 bottom-0 rounded-3xl bg-white/45 p-4 backdrop-blur-md sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-medium text-zinc-600 sm:text-xs">
              {card.nickname} · {ownerName}
            </p>
            <p className="cc-num tabular mt-1 text-base font-semibold whitespace-nowrap text-zinc-800 sm:text-lg">
              <span className="tracking-[0.12em]">**** **** ****</span> {card.last4}
            </p>
          </div>
          <span className="cc-chip h-7 w-10 shrink-0 rounded-md bg-gradient-to-br from-zinc-200 via-white to-zinc-400 shadow-inner" />
        </div>
      </div>
    </div>
  );
}

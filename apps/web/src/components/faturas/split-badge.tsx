import type { HouseholdConfig, Split } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export function splitLabel(split: Split, cfg: HouseholdConfig): string {
  const a = cfg.users.USER_A.name.split(" ")[0];
  const b = cfg.users.USER_B.name.split(" ")[0];
  switch (split.type) {
    case "SHARED_DEFAULT":
      return `${cfg.defaultSplitPercentA}/${100 - cfg.defaultSplitPercentA}`;
    case "SHARED_CUSTOM":
      return `${split.percentA}/${100 - (split.percentA ?? 0)}`;
    case "INDIVIDUAL_A":
      return `Só ${a}`;
    case "INDIVIDUAL_B":
      return `Só ${b}`;
  }
}

export function SplitBadge({ split, cfg, className }: { split: Split; cfg: HouseholdConfig; className?: string }) {
  const individual = split.type === "INDIVIDUAL_A" || split.type === "INDIVIDUAL_B";
  return (
    <span
      className={cn(
        "tabular inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold",
        individual ? "bg-amber-50 text-amber-700" : split.type === "SHARED_CUSTOM" ? "bg-sky-50 text-sky-700" : "bg-brand-50 text-brand-600",
        className,
      )}
    >
      {splitLabel(split, cfg)}
    </span>
  );
}

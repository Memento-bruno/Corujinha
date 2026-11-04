"use client";

import * as C from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: C.CheckboxProps) {
  return (
    <C.Root
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white transition data-[state=checked]:border-zinc-900 data-[state=checked]:bg-zinc-900",
        className,
      )}
      {...props}
    >
      <C.Indicator>
        <Check className="size-3.5 text-white" strokeWidth={3} />
      </C.Indicator>
    </C.Root>
  );
}

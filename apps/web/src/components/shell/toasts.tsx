"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "@/lib/client/store";
import { cn } from "@/lib/utils";

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={cn(
              "pointer-events-auto max-w-md rounded-2xl px-4 py-2.5 text-sm font-medium shadow-float",
              t.tone === "error" ? "bg-rose-600 text-white" : t.tone === "success" ? "bg-emerald-600 text-white" : "bg-zinc-900 text-white",
            )}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

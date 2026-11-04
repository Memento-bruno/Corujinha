"use client";

import { motion } from "framer-motion";
import { Handshake, Home, ReceiptText, Scissors } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/faturas", label: "Faturas", icon: ReceiptText },
  { href: "/acerto", label: "Acerto", icon: Handshake },
  { href: "/cortes", label: "Cortes", icon: Scissors },
];

/** Navegação inferior flutuante em pílula (item ativo: pílula branca com ícone em círculo preto). */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="pb-safe pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/60 bg-white/75 p-1.5 shadow-float backdrop-blur-xl">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-12 items-center rounded-full transition-colors",
                active ? "pr-4 pl-1" : "w-12 justify-center bg-white shadow-soft hover:bg-slate-50",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full bg-white shadow-soft"
                  transition={{ type: "spring", bounce: 0.25, duration: 0.45 }}
                />
              )}
              <span
                className={cn(
                  "relative flex items-center justify-center rounded-full",
                  active ? "size-10 bg-zinc-900 text-white" : "size-10 text-zinc-500",
                )}
              >
                <Icon className="size-[18px]" />
              </span>
              {active && (
                <span className="relative ml-2 flex items-center gap-1.5 text-[13px] font-semibold text-zinc-900">
                  {label}
                  <span className="size-1 rounded-full bg-zinc-900" />
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

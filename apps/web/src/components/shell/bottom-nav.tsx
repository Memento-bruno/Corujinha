"use client";

import { motion } from "framer-motion";
import { Handshake, Home, ReceiptText, Settings, Target } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Início", icon: Home },
  { href: "/faturas", label: "Faturas", icon: ReceiptText },
  { href: "/acerto", label: "Acerto", icon: Handshake },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

/** Menu embaixo da tela: só ícones; o item aberto vira uma pílula preta com o nome. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu principal" className="pb-safe pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-zinc-200 bg-white/90 p-1.5 shadow-[0_10px_30px_rgba(0,0,0,.12)] backdrop-blur-xl">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              title={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-12 items-center rounded-full transition-colors",
                active ? "pr-[18px] pl-1.5 text-white" : "w-12 justify-center text-zinc-700 hover:bg-zinc-100",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full bg-zinc-900"
                  transition={{ type: "spring", bounce: 0.25, duration: 0.45 }}
                />
              )}
              <span className={cn("relative flex items-center justify-center rounded-full", active ? "size-9 bg-white/15" : "size-9")}>
                <Icon className="size-[18px]" />
              </span>
              {active && <span className="relative ml-2 text-sm font-bold">{label}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

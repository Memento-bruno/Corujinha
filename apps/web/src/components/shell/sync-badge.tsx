"use client";

import { AlertTriangle, CloudCheck, HardDrive, Loader2 } from "lucide-react";
import { useStore } from "@/lib/client/store";
import { cn } from "@/lib/utils";

export function SyncBadge({ className }: { className?: string }) {
  const { sync, state } = useStore();
  const drive = state?.mode.storage === "drive";
  const label =
    sync === "saving" || sync === "loading"
      ? "Sincronizando…"
      : sync === "error"
        ? "Erro ao salvar"
        : sync === "conflict"
          ? "Atualizado"
          : drive
            ? "Google Drive"
            : state?.mode.demo
              ? "Modo demo · local"
              : "Salvo localmente";
  const Icon = sync === "saving" || sync === "loading" ? Loader2 : sync === "error" ? AlertTriangle : drive ? CloudCheck : HardDrive;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        sync === "error" ? "border-rose-100 bg-rose-50 text-rose-600" : drive ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-amber-100 bg-amber-50 text-amber-700",
        className,
      )}
      title={drive ? "Dados criptografados na pasta compartilhada do Google Drive" : "Dados guardados no disco do servidor (fallback local)"}
    >
      <Icon className={cn("size-3.5", (sync === "saving" || sync === "loading") && "animate-spin")} />
      {label}
    </span>
  );
}

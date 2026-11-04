"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useDesktopViewport } from "@/lib/client/use-desktop-viewport";
import { AppProvider, useStore } from "@/lib/client/store";
import { BottomNav } from "./bottom-nav";
import { Header } from "./header";
import { Toasts } from "./toasts";

function Body({ children }: { children: React.ReactNode }) {
  const { state, error, reload } = useStore();
  if (!state) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-sm text-zinc-500">
        {error ? (
          <>
            <p className="max-w-xs text-center">Não consegui carregar os dados: {error}</p>
            <button className="font-semibold text-zinc-900 underline" onClick={() => void reload()}>
              Tentar de novo
            </button>
          </>
        ) : (
          <>
            <Loader2 className="size-6 animate-spin text-brand-500" />
            Carregando faturas…
          </>
        )}
      </div>
    );
  }
  return (
    <>
      <Header />
      {state.mode.demo && (
        <div className="mb-2 flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>Modo demonstração:</b> sem login e com dados fictícios guardados localmente. Configure o Google no
            <code className="mx-1 rounded bg-white/70 px-1">.env.local</code>para usar com dados reais.
          </span>
        </div>
      )}
      {children}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  // Início no celular = tela do computador encolhida; o menu de baixo fica no tamanho normal.
  const navZoom = useDesktopViewport(usePathname() === "/");
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return (
    <AppProvider>
      <Toasts />
      <div className="mx-auto w-full max-w-6xl px-3 pb-32 sm:px-6">
        <Body>{children}</Body>
      </div>
      <BottomNav zoom={navZoom} />
    </AppProvider>
  );
}

"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/client/report-error";

/** Se uma tela quebrar, mostra um aviso no lugar dela (o menu continua) e guarda o erro em Ajustes. */
export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error);
  }, [error]);
  return (
    <div className="mx-auto flex min-h-[50dvh] max-w-sm flex-col items-center justify-center gap-3 text-center text-sm text-zinc-600">
      <p className="text-base font-semibold text-zinc-900">Ops, esta tela deu erro.</p>
      <p>O erro ficou guardado em Configurações → Erros do app. Tente de novo; se continuar, copie os erros de lá e mande para correção.</p>
      <div className="flex gap-2">
        <button className="rounded-full bg-zinc-900 px-4 py-2 font-semibold text-white" onClick={() => reset()}>
          Tentar de novo
        </button>
        <a className="rounded-full border border-zinc-200 px-4 py-2 font-semibold text-zinc-900" href="/configuracoes#erros">
          Ver erros
        </a>
      </div>
    </div>
  );
}

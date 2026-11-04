import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { PluggyError } from "../integrations/pluggy-client";
import { ConflictError } from "./blob-store";
import { UnauthorizedError } from "./session";

/** Converte erros conhecidos em respostas HTTP sem vazar detalhes internos. */
export async function handle(fn: () => Promise<unknown>): Promise<NextResponse> {
  try {
    const body = await fn();
    return NextResponse.json(body ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (e instanceof ConflictError) {
      return NextResponse.json({ error: e.message, code: "CONFLICT" }, { status: 409 });
    }
    if (e instanceof ZodError) {
      return NextResponse.json({ error: "Dados inválidos", issues: e.issues.slice(0, 5) }, { status: 400 });
    }
    if (e instanceof BadRequestError) return NextResponse.json({ error: e.message }, { status: 400 });
    // Erro do provedor externo: 502 (nunca repassa 401 da Pluggy, que deslogaria o usuário).
    if (e instanceof PluggyError) return NextResponse.json({ error: e.message }, { status: 502 });
    console.error("[corujinha] erro na API:", e);
    return NextResponse.json({ error: "Erro interno. Veja o log do servidor." }, { status: 500 });
  }
}

export class BadRequestError extends Error {}

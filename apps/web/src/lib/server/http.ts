import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { PluggyError } from "../integrations/pluggy-client";
import { ConflictError, StorageUnavailableError } from "./blob-store";
import { BadRequestError, DRIVE_AUTH_MESSAGE, isDriveAuthError } from "./errors";

export { BadRequestError, isDriveAuthError };
import { recordError } from "./error-log";
import { UnauthorizedError } from "./session";

/** Converte erros conhecidos em respostas HTTP sem vazar detalhes internos. */
export async function handle(fn: () => Promise<unknown>, where?: string): Promise<NextResponse> {
  try {
    const body = await fn();
    return NextResponse.json(body ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const storage = asStorageError(e);
    if (storage) {
      console.error("[corujinha] armazenamento indisponível:", storage.code, (e as Error).message);
      return NextResponse.json({ error: storage.message, code: storage.code }, { status: 503 });
    }
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
    // Erro inesperado: fica também no registro de erros (Ajustes → Erros do app).
    const err = e instanceof Error ? e : new Error(String(e));
    await recordError({ where: "servidor", message: err.message, path: where, detail: err.stack?.split("\n").slice(0, 6).join("\n") });
    return NextResponse.json({ error: "Erro interno. Veja o log do servidor." }, { status: 500 });
  }
}



function asStorageError(e: unknown): StorageUnavailableError | null {
  if (e instanceof StorageUnavailableError) return e;
  if (isDriveAuthError(e)) return new StorageUnavailableError(DRIVE_AUTH_MESSAGE, "DRIVE_AUTH");
  return null;
}

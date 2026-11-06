import { z } from "zod";
import { ConflictError } from "@/lib/server/blob-store";
import { getDatabase } from "@/lib/server/database";
import { BadRequestError, handle } from "@/lib/server/http";
import { requireViewer } from "@/lib/server/session";
import type { HouseholdConfig } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

function todayBR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Grava o cadastro aplicando `fn` na versão mais nova (relê e tenta de novo se outro aparelho gravou antes). */
async function saveConfigWith(fn: (c: HouseholdConfig) => HouseholdConfig) {
  const db = await getDatabase();
  for (let attempt = 0; ; attempt++) {
    const latest = await db.getConfig();
    try {
      return await db.saveConfig(fn(latest.data), latest.etag);
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt >= 2) throw e;
    }
  }
}

/**
 * Modo fechamento: fecha tudo até a data escolhida (inclusive).
 * Só registro: nenhuma compra é apagada; o app passa a olhar só dali em diante.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await requireViewer();
    const body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(await req.json());
    if (Number.isNaN(Date.parse(`${body.date}T12:00:00Z`))) throw new BadRequestError("Data inválida.");
    if (body.date > todayBR()) throw new BadRequestError("Escolha hoje ou um dia que já passou.");
    return saveConfigWith((c) => ({ ...c, closing: { date: body.date, closedAt: new Date().toISOString(), closedBy: viewer.userId } }));
  });
}

/** Desfaz o fechamento: as compras voltam a contar e a poder ser editadas. */
export async function DELETE() {
  return handle(async () => {
    await requireViewer();
    return saveConfigWith((c) => {
      const { closing: _drop, ...rest } = c;
      void _drop;
      return rest;
    });
  });
}

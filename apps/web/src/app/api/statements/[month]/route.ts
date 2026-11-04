import { z } from "zod";
import { isMonthKey } from "@/lib/domain/months";
import { getDatabase } from "@/lib/server/database";
import { BadRequestError, handle } from "@/lib/server/http";
import { etagSchema, statementSchema } from "@/lib/server/schemas";
import { requireViewer } from "@/lib/server/session";
import type { StatementFile } from "@/lib/domain/types";

export async function PUT(req: Request, ctx: { params: Promise<{ month: string }> }) {
  return handle(async () => {
    await requireViewer();
    const { month } = await ctx.params;
    if (!isMonthKey(month)) throw new BadRequestError("Mês inválido");
    const body = z.object({ data: statementSchema, etag: etagSchema }).parse(await req.json());
    if (body.data.month !== month) throw new BadRequestError("Mês do arquivo não confere");
    const db = await getDatabase();
    const current = await db.getStatement(month);
    if (current.data.snapshot) throw new BadRequestError("Este mês já foi fechado. Reabra-o para editar.");
    // O snapshot só é criado pela rota de fechamento
    const data = { ...(body.data as StatementFile), snapshot: undefined };
    return db.saveStatement(data, body.etag);
  });
}

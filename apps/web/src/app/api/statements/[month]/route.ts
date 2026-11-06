import { z } from "zod";
import { isMonthKey } from "@/lib/domain/months";
import { getDatabase } from "@/lib/server/database";
import { BadRequestError, handle } from "@/lib/server/http";
import { etagSchema, statementSchema } from "@/lib/server/schemas";
import { requireViewer } from "@/lib/server/session";
import type { StatementFile } from "@/lib/domain/types";
import { keepLockedTxs } from "@/lib/domain/closing";

export const dynamic = "force-dynamic";

/** Versão mais nova da fatura do mês. */
export async function GET(_req: Request, ctx: { params: Promise<{ month: string }> }) {
  return handle(async () => {
    await requireViewer();
    const { month } = await ctx.params;
    if (!isMonthKey(month)) throw new BadRequestError("Mês inválido");
    return (await getDatabase()).getStatement(month);
  });
}

export async function PUT(req: Request, ctx: { params: Promise<{ month: string }> }) {
  return handle(async () => {
    await requireViewer();
    const { month } = await ctx.params;
    if (!isMonthKey(month)) throw new BadRequestError("Mês inválido");
    const body = z.object({ data: statementSchema, etag: etagSchema }).parse(await req.json());
    if (body.data.month !== month) throw new BadRequestError("Mês do arquivo não confere");
    const db = await getDatabase();
    const [current, config] = await Promise.all([db.getStatement(month), db.getConfig()]);
    if (current.data.snapshot) throw new BadRequestError("Este mês já foi fechado. Reabra-o para editar.");
    // O snapshot só é criado pela rota de fechamento
    const sent = body.data as StatementFile;
    // Compras até a data do fechamento ficam como estão gravadas.
    const data = { ...sent, transactions: keepLockedTxs(current.data.transactions, sent.transactions, month, config.data.closing), snapshot: undefined };
    return db.saveStatement(data, body.etag);
  });
}

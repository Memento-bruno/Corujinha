import { z } from "zod";
import { isMonthKey } from "@/lib/domain/months";
import { settleMonth, recurringToExpenses } from "@/lib/engines/settlement";
import { sumCents } from "@/lib/engines/analytics";
import { getDatabase } from "@/lib/server/database";
import { BadRequestError, handle } from "@/lib/server/http";
import { etagSchema } from "@/lib/server/schemas";
import { requireViewer } from "@/lib/server/session";

/**
 * "Fechar Mês": recalcula o encontro de contas NO SERVIDOR (não confia no cliente)
 * e salva o snapshot dentro de statements-YYYY-MM.json no Drive.
 * Somente registro: nenhum pagamento é feito pelo app.
 */
export async function POST(req: Request, ctx: { params: Promise<{ month: string }> }) {
  return handle(async () => {
    const viewer = await requireViewer();
    const { month } = await ctx.params;
    if (!isMonthKey(month)) throw new BadRequestError("Mês inválido");
    const body = z.object({ etag: etagSchema, reopen: z.boolean().optional() }).parse(await req.json());
    const db = await getDatabase();
    const [statement, recurring, config] = await Promise.all([db.getStatement(month), db.getRecurring(), db.getConfig()]);
    if (body.reopen) {
      return db.saveStatement({ ...statement.data, snapshot: undefined }, body.etag);
    }
    if (statement.data.snapshot) throw new BadRequestError("Este mês já está fechado.");
    const debts = recurring.data.debts;
    const settlement = settleMonth(month, statement.data.transactions, debts, config.data.defaultSplitPercentA);
    const snapshot = {
      closedAt: new Date().toISOString(),
      closedBy: viewer.userId,
      settlement,
      totalStatements: sumCents(statement.data.transactions),
      totalRecurring: sumCents(recurringToExpenses(debts, month)),
    };
    return db.saveStatement({ ...statement.data, snapshot }, body.etag);
  });
}

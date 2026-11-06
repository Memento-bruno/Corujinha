import { getDatabase } from "@/lib/server/database";
import { handle } from "@/lib/server/http";
import { requireViewer } from "@/lib/server/session";
import type { Cents, MonthKey, UserId } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export interface ClosedMonth {
  month: MonthKey;
  closedAt: string;
  closedBy: UserId;
  grossTotal: Cents;
  transfer: { from: UserId; to: UserId; amount: Cents } | null;
}

/** Histórico dos meses fechados: quem pagou quem em cada acerto (dos snapshots gravados). */
export async function GET() {
  return handle(async () => {
    await requireViewer();
    const db = await getDatabase();
    const months = (await db.listStatementMonths()).sort().reverse().slice(0, 36);
    const files = await Promise.all(months.map((m) => db.getStatement(m)));
    const out: ClosedMonth[] = [];
    for (const f of files) {
      const s = f.data.snapshot;
      if (!s) continue;
      out.push({ month: f.data.month, closedAt: s.closedAt, closedBy: s.closedBy, grossTotal: s.settlement.grossTotal, transfer: s.settlement.transfer });
    }
    return { months: out };
  });
}

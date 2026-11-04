import { addMonths, isMonthKey, monthOf, monthRange } from "@/lib/domain/months";
import { getDatabase } from "@/lib/server/database";
import { isAuthConfigured, isDemoMode, isDriveConfigured, isPluggyConfigured } from "@/lib/server/env";
import { handle, BadRequestError } from "@/lib/server/http";
import { requireViewer } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Estado completo para a interface: config, recorrentes e as faturas do mês + 5 anteriores. */
export async function GET(req: Request) {
  return handle(async () => {
    const viewer = await requireViewer();
    const db = await getDatabase();
    const available = await db.listStatementMonths();
    const url = new URL(req.url);
    const requested = url.searchParams.get("month");
    if (requested && !isMonthKey(requested)) throw new BadRequestError("Mês inválido");
    const month = requested ?? available.at(-1) ?? monthOf(new Date());
    const months = monthRange(month, 6);
    const [config, recurring, ...statements] = await Promise.all([
      db.getConfig(),
      db.getRecurring(),
      ...months.map((m) => db.getStatement(m)),
    ]);
    const nextMonth = addMonths(month, 1);
    return {
      mode: {
        storage: db.kind,
        demo: isDemoMode(),
        encrypted: db.encrypted,
        authConfigured: isAuthConfigured(),
        driveConfigured: isDriveConfigured(),
        pluggyConfigured: isPluggyConfigured(),
      },
      viewer,
      month,
      availableMonths: [...new Set([...available, month, nextMonth])].sort(),
      config,
      recurring,
      statements: Object.fromEntries(months.map((m, i) => [m, statements[i]])),
    };
  });
}

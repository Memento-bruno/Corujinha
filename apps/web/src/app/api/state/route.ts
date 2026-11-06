import { addMonths, isMonthKey, monthRange } from "@/lib/domain/months";
import { getDatabase } from "@/lib/server/database";
import { isAuthConfigured, isDemoMode, isDriveConfigured, isPluggyBlockedByMissingLogin, isPluggyConfigured } from "@/lib/server/env";
import { handle, BadRequestError } from "@/lib/server/http";
import { requireViewer } from "@/lib/server/session";

export const dynamic = "force-dynamic";

type Db = Awaited<ReturnType<typeof getDatabase>>;

function currentMonthBR(): string {
  // O servidor roda em UTC: usamos o horário de Brasília para virar o mês na hora certa.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

/**
 * Fatura em aberto: o mês seguinte à última fatura que o banco já fechou (pelo Open Finance),
 * nunca antes do mês atual. Ex.: em novembro, com a fatura de novembro fechada, abre dezembro.
 * Sem banco conectado, é o mês atual.
 */
async function openBillMonth(getStatement: (m: string) => ReturnType<Db["getStatement"]>): Promise<string> {
  const now = currentMonthBR();
  const around = [addMonths(now, -1), now, addMonths(now, 1)];
  const files = await Promise.all(around.map((m) => getStatement(m)));
  const closed = around.filter((m, i) => Object.keys(files[i].data.bankBills ?? {}).length > 0);
  const next = closed.length ? addMonths(closed.at(-1)!, 1) : now;
  return next > now ? next : now;
}

/** Estado completo para a interface: config, recorrentes e as faturas em volta do mês (12 meses) e da fatura em aberto. */
export async function GET(req: Request) {
  return handle(async () => {
    const viewer = await requireViewer();
    const db = await getDatabase();
    // Uma listagem da pasta serve para todos os arquivos abaixo (e meses vazios nem vão ao Drive).
    await db.prime();
    // Cada mês é lido uma vez só nesta requisição (a fatura em aberto e a faixa de meses se repetem).
    const reads = new Map<string, ReturnType<Db["getStatement"]>>();
    const getStatement = (m: string) => {
      let p = reads.get(m);
      if (!p) reads.set(m, (p = db.getStatement(m)));
      return p;
    };
    const available = await db.listStatementMonths();
    const url = new URL(req.url);
    const requested = url.searchParams.get("month");
    if (requested && !isMonthKey(requested)) throw new BadRequestError("Mês inválido");
    const openMonth = await openBillMonth(getStatement);
    const month = requested ?? openMonth;
    // Mês escolhido com 6 anteriores e 5 seguintes (gráficos de evolução e previsão)
    // + a faixa de 12 meses do topo, que fica fixa em volta da fatura em aberto.
    const months = [...new Set([...monthRange(addMonths(month, 5), 12), ...monthRange(addMonths(openMonth, 5), 12)])].sort();
    const [config, recurring, ...statements] = await Promise.all([
      db.getConfig(),
      db.getRecurring(),
      ...months.map((m) => getStatement(m)),
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
        pluggyNeedsLogin: isPluggyBlockedByMissingLogin(),
      },
      viewer,
      month,
      openMonth,
      availableMonths: [...new Set([...available, month, nextMonth])].sort(),
      config,
      recurring,
      statements: Object.fromEntries(months.map((m, i) => [m, statements[i]])),
    };
  });
}

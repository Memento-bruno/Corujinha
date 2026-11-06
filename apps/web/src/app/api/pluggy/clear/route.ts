import { clearPluggyTransactions } from "@/lib/integrations/pluggy-sync";
import { getDatabase } from "@/lib/server/database";
import { handle } from "@/lib/server/http";
import { requireViewer } from "@/lib/server/session";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Apaga as compras importadas do banco (para recomeçar do zero). Não toca em compras manuais nem em meses fechados. */
export async function POST() {
  return handle(async () => {
    await requireViewer();
    const db = await getDatabase();
    // Cópia de tudo antes de apagar em massa (dá para voltar em Ajustes → Segurança).
    await db.backup("antes-de-apagar-compras-do-banco");
    return clearPluggyTransactions(db);
  });
}

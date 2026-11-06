import { z } from "zod";
import { disconnectPluggyItem } from "@/lib/integrations/pluggy-sync";
import { getDatabase } from "@/lib/server/database";
import { handle } from "@/lib/server/http";
import { requireViewer } from "@/lib/server/session";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Desconecta uma conexão Open Finance e apaga as compras que vieram dela (meses fechados ficam). */
export async function POST(req: Request) {
  return handle(async () => {
    await requireViewer();
    const { itemId } = z.object({ itemId: z.string().regex(/^[0-9a-f-]{36}$/i) }).parse(await req.json());
    const db = await getDatabase();
    // Cópia de tudo antes de apagar em massa (dá para voltar em Ajustes → Segurança).
    await db.backup("antes-de-desconectar-banco");
    return disconnectPluggyItem(db, itemId.toLowerCase());
  });
}

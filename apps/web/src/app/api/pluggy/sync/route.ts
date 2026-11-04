import { z } from "zod";
import { syncPluggy } from "@/lib/integrations/pluggy-sync";
import { getDatabase } from "@/lib/server/database";
import { isPluggyConfigured } from "@/lib/server/env";
import { BadRequestError, handle } from "@/lib/server/http";
import { requireViewer } from "@/lib/server/session";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Sincroniza as faturas dos cartões via Open Finance (Meu Pluggy). Somente leitura. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireViewer();
    if (!isPluggyConfigured()) {
      throw new BadRequestError("Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env.local.");
    }
    const body = z.object({ monthsBack: z.number().int().min(1).max(12).optional() }).parse(await req.json().catch(() => ({})));
    const db = await getDatabase();
    return syncPluggy(db, body.monthsBack ?? 3);
  });
}

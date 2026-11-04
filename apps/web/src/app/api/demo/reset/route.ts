import { getDatabase } from "@/lib/server/database";
import { BadRequestError, handle } from "@/lib/server/http";
import { requireViewer } from "@/lib/server/session";

export async function POST() {
  return handle(async () => {
    await requireViewer();
    const db = await getDatabase();
    if (db.kind !== "local") throw new BadRequestError("Disponível apenas no armazenamento local.");
    await db.resetDemo();
    return { ok: true };
  });
}

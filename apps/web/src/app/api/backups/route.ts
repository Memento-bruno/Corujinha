import { z } from "zod";
import { getDatabase } from "@/lib/server/database";
import { handle } from "@/lib/server/http";
import { requireViewer } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cópias de segurança guardadas na pasta do Drive (mais nova primeiro). */
export async function GET() {
  return handle(async () => {
    await requireViewer();
    return { backups: await (await getDatabase()).listBackups() };
  });
}

/** `create`: faz uma cópia agora. `restore`: volta tudo para a cópia escolhida (antes, guarda o estado atual). */
export async function POST(req: Request) {
  return handle(async () => {
    await requireViewer();
    const body = z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("create") }),
        z.object({ action: z.literal("restore"), name: z.string().regex(/^backup-[a-z0-9-]+\.json$/).max(120) }),
      ])
      .parse(await req.json());
    const db = await getDatabase();
    if (body.action === "create") return { backup: await db.backup("manual") };
    return db.restoreBackup(body.name);
  });
}

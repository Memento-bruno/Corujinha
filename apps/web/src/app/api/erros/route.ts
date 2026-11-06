import { z } from "zod";
import { getDatabase } from "@/lib/server/database";
import { recordError } from "@/lib/server/error-log";
import { handle } from "@/lib/server/http";
import { requireViewer } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Erros recentes do app (Ajustes → Erros do app), o mais recente primeiro. */
export async function GET() {
  return handle(async () => {
    await requireViewer();
    const db = await getDatabase();
    return { entries: (await db.getErrorLog()).data.entries };
  }, "/api/erros");
}

const Report = z.object({
  message: z.string().max(2000),
  path: z.string().max(500).optional(),
  detail: z.string().max(5000).optional(),
});

/** A tela avisa que deu um erro inesperado nela. */
export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await requireViewer();
    const body = Report.parse(await req.json());
    await recordError({ where: "tela", user: viewer.userId, ...body });
    return { ok: true };
  }, "/api/erros");
}

/** Limpa a lista (depois de mandar os erros para correção). */
export async function DELETE() {
  return handle(async () => {
    await requireViewer();
    const db = await getDatabase();
    const cur = await db.getErrorLog();
    await db.saveErrorLog({ ...cur.data, entries: [] }, cur.etag);
    return { ok: true };
  }, "/api/erros");
}

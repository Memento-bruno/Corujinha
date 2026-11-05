import { getDatabase } from "@/lib/server/database";
import { handle } from "@/lib/server/http";
import { requireViewer } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Versão (ETag) de cada arquivo. O app consulta de tempos em tempos para trazer o que mudou em outro aparelho. */
export async function GET() {
  return handle(async () => {
    await requireViewer();
    const db = await getDatabase();
    return { files: await db.versions() };
  });
}

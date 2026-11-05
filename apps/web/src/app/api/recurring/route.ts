import { z } from "zod";
import { getDatabase } from "@/lib/server/database";
import { handle } from "@/lib/server/http";
import { etagSchema, recurringSchema } from "@/lib/server/schemas";
import { requireViewer } from "@/lib/server/session";
import type { RecurringDebtsFile } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/** Versão mais nova das contas fixas. */
export async function GET() {
  return handle(async () => {
    await requireViewer();
    return (await getDatabase()).getRecurring();
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    await requireViewer();
    const body = z.object({ data: recurringSchema, etag: etagSchema }).parse(await req.json());
    const db = await getDatabase();
    return db.saveRecurring(body.data as RecurringDebtsFile, body.etag);
  });
}

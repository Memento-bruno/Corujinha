import { z } from "zod";
import { getDatabase } from "@/lib/server/database";
import { handle } from "@/lib/server/http";
import { configSchema, etagSchema } from "@/lib/server/schemas";
import { requireViewer } from "@/lib/server/session";
import type { HouseholdConfig } from "@/lib/domain/types";

export async function PUT(req: Request) {
  return handle(async () => {
    await requireViewer();
    const body = z.object({ data: configSchema, etag: etagSchema }).parse(await req.json());
    const db = await getDatabase();
    // E-mails nunca são gravados a partir do cliente: vêm só do .env.
    const data = body.data as HouseholdConfig;
    delete data.users.USER_A.email;
    delete data.users.USER_B.email;
    return db.saveConfig(data, body.etag);
  });
}

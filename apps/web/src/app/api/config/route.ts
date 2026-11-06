import { z } from "zod";
import { getDatabase } from "@/lib/server/database";
import { handle } from "@/lib/server/http";
import { configSchema, etagSchema } from "@/lib/server/schemas";
import { requireViewer } from "@/lib/server/session";
import { otherUser, type HouseholdConfig } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/** Versão mais nova do cadastro (usada para juntar edições quando outro aparelho gravou antes). */
export async function GET() {
  return handle(async () => {
    await requireViewer();
    return (await getDatabase()).getConfig();
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const viewer = await requireViewer();
    const body = z.object({ data: configSchema, etag: etagSchema }).parse(await req.json());
    const db = await getDatabase();
    // E-mails nunca são gravados a partir do cliente: vêm só do .env.
    const data = body.data as HouseholdConfig;
    delete data.users.USER_A.email;
    delete data.users.USER_B.email;
    // Cada um só muda o próprio salário: o do outro fica como está gravado.
    const partner = otherUser(viewer.userId);
    const current = (await db.getConfig()).data;
    const incomes = { ...data.incomes };
    if (current.incomes?.[partner] !== undefined) incomes[partner] = current.incomes[partner];
    else delete incomes[partner];
    data.incomes = incomes;
    // A conversão "compra é do dono da fatura" só roda uma vez: quem marca isso é o servidor.
    if (current.ownerPaysCardsAt) data.ownerPaysCardsAt = current.ownerPaysCardsAt;
    // O fechamento por data só muda pela rota própria (/api/fechamento).
    if (current.closing) data.closing = current.closing;
    else delete data.closing;
    return db.saveConfig(data, body.etag);
  });
}

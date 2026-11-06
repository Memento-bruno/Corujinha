import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { addMonths } from "@/lib/domain/months";
import type { MonthKey, StatementFile, UserId } from "@/lib/domain/types";
import { dueReminders, reminderEmail } from "@/lib/engines/reminders";
import { getDatabase } from "@/lib/server/database";
import { env, isAuthConfigured, storageMode } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function sameSecret(a: string, b: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

/**
 * Lembrete diário de vencimento por e-mail (tarefa agendada da Vercel, ver vercel.json).
 * - Desligado sem CRON_SECRET ou sem RESEND_API_KEY.
 * - Só aceita a chamada da Vercel (cabeçalho Authorization: Bearer CRON_SECRET).
 * - Manda para cada um só o que é dele, e só para os e-mails autorizados do .env.
 * - Só lê os dados; não muda nada.
 */
export async function GET(req: Request) {
  const secret = env.cronSecret;
  if (!secret || !env.resendApiKey || !isAuthConfigured() || storageMode() !== "drive") {
    return NextResponse.json({ error: "Lembretes desligados" }, { status: 404 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!sameSecret(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const month = today.slice(0, 7) as MonthKey;
  const db = await getDatabase();
  const [cfg, recurring, cur, next] = await Promise.all([
    db.getConfig(),
    db.getRecurring(),
    db.getStatement(month),
    db.getStatement(addMonths(month, 1)),
  ]);
  const statements: Record<MonthKey, StatementFile> = { [month]: cur.data, [addMonths(month, 1)]: next.data };
  const byUser = dueReminders(today, recurring.data.debts, statements, cfg.data);

  const sent: UserId[] = [];
  const errors: string[] = [];
  for (const u of ["USER_A", "USER_B"] as UserId[]) {
    const to = env.allowedEmails[u];
    const items = byUser[u];
    if (!to || items.length === 0 || cfg.data.reminderEmails?.[u] === false) continue;
    const mail = reminderEmail(cfg.data.users[u].name.split(" ")[0], items, env.appUrl);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.reminderFrom, to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (res.ok) sent.push(u);
    else errors.push(`${u}: ${res.status}`);
  }
  return NextResponse.json({ today, sent, errors });
}

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/database";
import { env, isAuthConfigured, storageMode } from "@/lib/server/env";
import { recordError } from "@/lib/server/error-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Faz a cópia automática se a mais nova tiver mais que isso. */
const MIN_AGE_MS = 6 * 24 * 60 * 60 * 1000;

function sameSecret(a: string, b: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

/**
 * Cópia de segurança automática semanal (tarefa agendada da Vercel, ver vercel.json).
 * Só roda com CRON_SECRET e com o Drive ligado. Pula se já existe uma cópia dos últimos 6 dias.
 */
export async function GET(req: Request) {
  const secret = env.cronSecret;
  if (!secret || !isAuthConfigured() || storageMode() !== "drive") {
    return NextResponse.json({ error: "Cópia automática desligada" }, { status: 404 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!sameSecret(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const db = await getDatabase();
    const [latest] = await db.listBackups();
    if (latest && Date.now() - new Date(latest.createdAt).getTime() < MIN_AGE_MS) {
      return NextResponse.json({ skipped: true, latest: latest.createdAt });
    }
    const backup = await db.backup("automatica");
    return NextResponse.json({ created: backup.name });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[corujinha] cópia automática falhou:", err);
    await recordError({ where: "servidor", message: `Cópia automática: ${err.message}`, path: "/api/cron/copia" });
    return NextResponse.json({ error: "Falhou" }, { status: 500 });
  }
}

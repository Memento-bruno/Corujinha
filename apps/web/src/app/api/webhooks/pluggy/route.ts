import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { syncPluggy } from "@/lib/integrations/pluggy-sync";
import { getDatabase } from "@/lib/server/database";
import { env, isPluggyConfigured } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Eventos que significam "tem dado novo para ler". */
const SYNC_EVENTS = new Set(["item/created", "item/updated", "transactions/created", "transactions/updated"]);

function sameSecret(a: string, b: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

/**
 * Webhook da Pluggy: quando o banco tem compras novas, sincroniza sem ninguém abrir o app.
 * - Desligado se PLUGGY_WEBHOOK_SECRET não estiver definido.
 * - Só aceita chamadas com ?token=<PLUGGY_WEBHOOK_SECRET>.
 * - Só age em conexões cadastradas no app, e só para LER (mesma sincronização do botão).
 * - Responde na hora (a Pluggy exige 2XX em até 5s) e sincroniza depois, com after().
 */
export async function POST(req: Request) {
  const secret = env.pluggyWebhookSecret;
  if (!secret || !isPluggyConfigured()) return NextResponse.json({ error: "Webhook desligado" }, { status: 404 });
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!sameSecret(token, secret)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { event?: unknown; itemId?: unknown; eventId?: unknown };
  const event = typeof body.event === "string" ? body.event : "";
  const itemId = typeof body.itemId === "string" ? body.itemId.toLowerCase() : "";

  if (event === "item/error") {
    console.warn("[corujinha] Pluggy item/error", itemId.slice(0, 8));
  } else if (SYNC_EVENTS.has(event) && itemId) {
    after(async () => {
      try {
        const db = await getDatabase();
        const cfg = await db.getConfig();
        if (!(cfg.data.pluggyItems ?? []).some((i) => i.itemId === itemId)) return;
        const r = await syncPluggy(db, 2);
        console.log(`[corujinha] webhook ${event}: ${r.added} compra(s) nova(s)`);
      } catch (e) {
        console.error("[corujinha] falha na sincronização via webhook:", (e as Error).message);
      }
    });
  }
  return NextResponse.json({ received: true });
}

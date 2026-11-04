import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { env, isAuthConfigured } from "@/lib/server/env";
import { getViewer } from "@/lib/server/session";

/**
 * Assistente de configuração: gera o REFRESH TOKEN MESTRE do Drive.
 * Só funciona com o login configurado e para um dos dois e-mails autorizados.
 * O token é mostrado UMA vez para ser colado em GOOGLE_DRIVE_REFRESH_TOKEN no .env.local.
 */
export async function GET() {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "Configure o login Google primeiro (GOOGLE_CLIENT_ID/SECRET, AUTH_SECRET)." }, { status: 400 });
  }
  const viewer = await getViewer();
  if (!viewer || viewer.demo) return NextResponse.json({ error: "Faça login com um e-mail autorizado." }, { status: 401 });

  const state = randomBytes(16).toString("hex");
  const client = new google.auth.OAuth2(env.googleClientId, env.googleClientSecret, `${env.appUrl}/api/drive/callback`);
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
    state,
    login_hint: viewer.email ?? undefined,
  });
  const res = NextResponse.redirect(url);
  res.cookies.set("corujinha_drive_state", state, { httpOnly: true, sameSite: "lax", secure: env.appUrl.startsWith("https"), maxAge: 600, path: "/api/drive" });
  return res;
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { google } from "googleapis";
import { env, isAuthConfigured } from "@/lib/server/env";
import { getViewer } from "@/lib/server/session";

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f5f7;color:#18181b;margin:0;padding:24px}main{max-width:640px;margin:40px auto;background:#fff;border-radius:24px;padding:28px;box-shadow:0 1px 2px rgba(0,0,0,.05)}code,textarea{font-family:ui-monospace,monospace;font-size:13px}textarea{width:100%;height:120px;border:1px solid #e4e4e7;border-radius:12px;padding:12px;box-sizing:border-box}</style></head>
<body><main><h1 style="font-size:20px">${title}</h1>${body}</main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  if (!isAuthConfigured()) return page("Login não configurado", "<p>Configure o login Google primeiro.</p>", 400);
  const viewer = await getViewer();
  if (!viewer || viewer.demo) return page("Não autorizado", "<p>Faça login com um e-mail autorizado.</p>", 401);

  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("corujinha_drive_state")?.value;
  if (!expected || url.searchParams.get("state") !== expected) {
    return page("Sessão expirada", '<p>Abra <a href="/api/drive/connect">/api/drive/connect</a> de novo.</p>', 400);
  }
  const code = url.searchParams.get("code");
  if (!code) return page("Autorização cancelada", "<p>Nenhum código recebido do Google.</p>", 400);

  const client = new google.auth.OAuth2(env.googleClientId, env.googleClientSecret, `${env.appUrl}/api/drive/callback`);
  const { tokens } = await client.getToken(code);
  jar.delete("corujinha_drive_state");
  if (!tokens.refresh_token) {
    return page(
      "O Google não devolveu um refresh token",
      "<p>Remova o acesso do app em <a href='https://myaccount.google.com/permissions'>myaccount.google.com/permissions</a> e tente de novo.</p>",
      400,
    );
  }
  const esc = tokens.refresh_token.replace(/[<>&"]/g, "");
  return page(
    "Refresh token gerado",
    `<p>Cole no <code>apps/web/.env.local</code> e reinicie o servidor (<code>npm run dev</code>):</p>
<textarea readonly onclick="this.select()">GOOGLE_DRIVE_AUTH_MODE=oauth_refresh_token
GOOGLE_DRIVE_REFRESH_TOKEN=${esc}</textarea>
<p style="color:#e11d48">Trate este valor como uma senha: ele dá acesso ao seu Google Drive. Não compartilhe nem faça commit dele.</p>`,
  );
}

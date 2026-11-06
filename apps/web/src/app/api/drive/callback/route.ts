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
  const cookie = jar.get("corujinha_drive_state")?.value ?? "";
  const [expected, flag] = cookie.split(":");
  const restricted = flag === "r";
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
  const test = restricted ? await testRestricted(client, tokens.refresh_token) : null;
  return page(
    restricted ? "Token com acesso menor gerado" : "Refresh token gerado",
    `${test ?? ""}<p>Na Vercel: Settings → Environment Variables → troque o valor de <code>GOOGLE_DRIVE_REFRESH_TOKEN</code> por este e faça <b>Redeploy</b>. (No PC: cole no <code>apps/web/.env.local</code> e reinicie.)</p>
<textarea readonly onclick="this.select()">${esc}</textarea>
<p style="color:#e11d48">Trate este valor como uma senha: ele dá acesso ao seu Google Drive. Não compartilhe nem faça commit dele.</p>`,
  );
}

/**
 * Testa o token "só arquivos do app" (drive.file): ele precisa enxergar todos os arquivos da pasta
 * e conseguir criar um arquivo novo nela (cada mês novo é um arquivo novo).
 */
async function testRestricted(client: InstanceType<typeof google.auth.OAuth2>, refreshToken: string): Promise<string> {
  const folder = env.driveFolderId;
  if (!folder) return "<p>Não deu para testar: GOOGLE_DRIVE_FOLDER_ID não está configurado.</p>";
  client.setCredentials({ refresh_token: refreshToken });
  const drive = google.drive({ version: "v3", auth: client });
  const names = async (d: typeof drive) => {
    const out = new Set<string>();
    let pageToken: string | undefined;
    do {
      const r = await d.files.list({ q: `'${folder}' in parents and trashed = false`, fields: "nextPageToken, files(name)", pageSize: 1000, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true });
      for (const f of r.data.files ?? []) if (f.name) out.add(f.name);
      pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  };
  const bad = (msg: string) =>
    `<p style="background:#fff1f2;color:#be123c;padding:12px;border-radius:12px"><b>Não funciona com o acesso menor:</b> ${msg} <b>Não troque o token.</b> Continue com o atual.</p>`;
  try {
    const seen = await names(drive);
    let total: Set<string> | null = null;
    if (env.driveRefreshToken) {
      const full = new google.auth.OAuth2(env.googleClientId, env.googleClientSecret);
      full.setCredentials({ refresh_token: env.driveRefreshToken });
      total = await names(google.drive({ version: "v3", auth: full })).catch(() => null);
    }
    const missing = total ? [...total].filter((n) => !seen.has(n)) : [];
    if (missing.length) return bad(`ele não enxerga ${missing.length} arquivo(s) da pasta (ex.: ${missing.slice(0, 3).join(", ").replace(/[<>&"]/g, "")}).`);
    const created = await drive.files.create({
      requestBody: { name: "teste-acesso-corujinha.json", parents: [folder], mimeType: "application/json" },
      media: { mimeType: "application/json", body: "{}" },
      fields: "id",
      supportsAllDrives: true,
    });
    if (created.data.id) await drive.files.delete({ fileId: created.data.id, supportsAllDrives: true });
    return `<p style="background:#ecfdf5;color:#047857;padding:12px;border-radius:12px"><b>Funciona!</b> Com o acesso menor o app enxerga os ${seen.size} arquivo(s) da pasta e consegue criar arquivos novos. Pode trocar o token.</p>`;
  } catch (e) {
    return bad(`o Google recusou (${String((e as Error).message ?? "erro").slice(0, 120).replace(/[<>&"]/g, "")}).`);
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isDemoMode } from "@/lib/server/env";

/**
 * Proteção de rotas: sem sessão válida de um dos dois e-mails autorizados,
 * páginas redirecionam para /login e APIs respondem 401.
 * (Cada rota de API também valida a sessão novamente — defesa em profundidade.)
 */
export default auth((req) => {
  if (isDemoMode()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname === "/privacidade" ||
    pathname.startsWith("/api/auth") ||
    // Chamado pelos servidores da Pluggy; protegido por segredo próprio na URL.
    pathname === "/api/webhooks/pluggy" ||
    // Tarefa agendada da Vercel; protegida pelo CRON_SECRET no cabeçalho.
    pathname === "/api/cron/lembretes" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js";
  if (isPublic) return NextResponse.next();
  const userId = (req.auth?.user as { userId?: string } | undefined)?.userId;
  if (userId) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const url = new URL("/login", req.nextUrl.origin);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.(?:png|svg|ico|webp)$).*)"],
};

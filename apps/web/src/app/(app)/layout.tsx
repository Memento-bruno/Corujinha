import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getViewer } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Telas do app: no celular, o navegador desenha com 920px de largura e encolhe para caber
 * (mesma arrumação do computador). Fixo desde o servidor, sem trocar depois. O computador ignora.
 */
export const viewport: Viewport = {
  themeColor: "#f4f5f7",
  width: 920,
  // Sem escala inicial: o navegador encolhe sozinho até a largura caber na tela.
  initialScale: undefined,
  // No iPhone, impede o zoom automático ao tocar num campo de texto (a tela pulava). Pinça continua.
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return <AppShell>{children}</AppShell>;
}

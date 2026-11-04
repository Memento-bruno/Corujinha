import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Corujinha",
  description: "Faturas de cartão do casal, divisão e encontro de contas.",
  applicationName: "Corujinha",
  appleWebApp: { capable: true, title: "Corujinha", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f4f5f7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-app font-sans antialiased">{children}</body>
    </html>
  );
}

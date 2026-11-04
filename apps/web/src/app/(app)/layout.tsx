import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getViewer } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return <AppShell>{children}</AppShell>;
}

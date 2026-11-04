import "server-only";
import { auth } from "@/auth";
import type { UserId } from "../domain/types";
import { isDemoMode, userIdForEmail } from "./env";

export interface Viewer {
  userId: UserId;
  email: string | null;
  image: string | null;
  demo: boolean;
}

/** Quem está usando o app. No modo demo (sem credenciais), é sempre o USER_A. */
export async function getViewer(): Promise<Viewer | null> {
  if (isDemoMode()) return { userId: "USER_A", email: null, image: null, demo: true };
  const session = await auth();
  const email = session?.user?.email ?? null;
  const userId = userIdForEmail(email);
  if (!userId) return null;
  return { userId, email, image: session?.user?.image ?? null, demo: false };
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Não autorizado");
  }
}

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw new UnauthorizedError();
  return v;
}

import { z } from "zod";
import { createConnectToken } from "@/lib/integrations/pluggy-client";
import { isPluggyConfigured } from "@/lib/server/env";
import { BadRequestError, handle } from "@/lib/server/http";
import { requireViewer } from "@/lib/server/session";

export const runtime = "nodejs";

/**
 * Gera o connect token para o widget Pluggy Connect (conectar ou reconectar um banco).
 * Só usuários logados; o client secret nunca vai para o navegador.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await requireViewer();
    if (!isPluggyConfigured()) {
      throw new BadRequestError("Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no servidor.");
    }
    const body = z
      .object({ itemId: z.string().regex(/^[0-9a-f-]{36}$/i).optional() })
      .parse(await req.json().catch(() => ({})));
    const accessToken = await createConnectToken(`corujinha-${viewer.userId}`, body.itemId);
    return { accessToken };
  });
}

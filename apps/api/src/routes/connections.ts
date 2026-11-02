import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import type { FinanceProvider } from "../providers/index.js";
import type { HouseholdStore } from "../store.js";

export function connectionRoutes(
  app: FastifyInstance,
  deps: { provider: FinanceProvider; store: HouseholdStore; config: Config },
) {
  const { provider, store, config } = deps;

  // Token para abrir o widget de conexão (Pluggy Connect) no celular.
  app.post("/connections/token", async (req) => {
    return provider.createConnectToken({ userId: req.userId! });
  });

  // Baixa as faturas da conexão. Em modo one_shot, revoga o consentimento em seguida.
  app.post("/connections/:itemId/sync", async (req) => {
    const { itemId } = z.object({ itemId: z.string().min(1).max(128) }).parse(req.params);
    const since = new Date();
    since.setMonth(since.getMonth() - 3);
    const { cards, bills } = await provider.fetchCardsAndBills({
      itemId,
      ownerId: req.userId!,
      since: since.toISOString().slice(0, 10),
    });
    await store.upsertCardsAndBills(cards, bills);

    let revoked = false;
    if (config.CONSENT_MODE === "one_shot") {
      await provider.revokeConnection(itemId);
      revoked = true;
    }
    return { cards: cards.length, bills: bills.length, consentRevoked: revoked };
  });

  // Revogação manual ("desconectar banco").
  app.delete("/connections/:itemId", async (req, reply) => {
    const { itemId } = z.object({ itemId: z.string().min(1).max(128) }).parse(req.params);
    await provider.revokeConnection(itemId);
    return reply.code(204).send();
  });
}

import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { SplitError, type Person } from "@corujinha/core";
import Fastify from "fastify";
import { ZodError } from "zod";
import { buildAuthenticate } from "./auth/authenticate.js";
import type { Config } from "./config.js";
import { buildProvider, type FinanceProvider } from "./providers/index.js";
import { connectionRoutes } from "./routes/connections.js";
import { householdRoutes } from "./routes/household.js";
import { MemoryStore, type HouseholdStore } from "./store.js";

export async function buildApp(
  config: Config,
  overrides: { provider?: FinanceProvider; store?: HouseholdStore } = {},
) {
  const app = Fastify({
    logger:
      config.NODE_ENV === "test"
        ? false
        : {
            // Nunca logar tokens nem corpos de requisição com dados financeiros.
            redact: ["req.headers.authorization", "req.headers.cookie"],
          },
    bodyLimit: 64 * 1024,
  });

  const provider = overrides.provider ?? buildProvider(config);
  const people: Person[] = config.ALLOWED_USER_IDS.map((id, i) => ({ id, name: `Pessoa ${i + 1}` }));
  const store = overrides.store ?? new MemoryStore(people);

  await app.register(helmet);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "dados_invalidos", issues: err.issues });
    }
    if (err instanceof SplitError) {
      return reply.code(422).send({ error: err.code, message: err.message });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
    req.log.error(err);
    return reply.code(500).send({ error: "erro_interno" });
  });

  app.get("/health", async () => ({ ok: true }));

  // Tudo abaixo exige login + estar na lista do casal.
  await app.register(async (secured) => {
    secured.addHook("onRequest", buildAuthenticate(config));
    connectionRoutes(secured, { provider, store, config });
    householdRoutes(secured, { store });
  });

  return app;
}

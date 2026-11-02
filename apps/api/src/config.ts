import { z } from "zod";

const csv = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().default(3333),
    FINANCE_PROVIDER: z.enum(["mock", "pluggy"]).default("mock"),
    PLUGGY_CLIENT_ID: z.string().optional(),
    PLUGGY_CLIENT_SECRET: z.string().optional(),
    PLUGGY_BASE_URL: z.string().url().default("https://api.pluggy.ai"),
    CONSENT_MODE: z.enum(["one_shot", "keep"]).default("one_shot"),
    AUTH_JWKS_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),
    AUTH_ISSUER: z.string().optional(),
    AUTH_AUDIENCE: z.string().default("authenticated"),
    ALLOWED_USER_IDS: csv,
    DEV_AUTH_TOKEN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.ALLOWED_USER_IDS.length === 0 || env.ALLOWED_USER_IDS.length > 2) {
      ctx.addIssue({
        code: "custom",
        path: ["ALLOWED_USER_IDS"],
        message: "Informe 1 ou 2 IDs de usuário. O app é restrito ao casal.",
      });
    }
    if (env.FINANCE_PROVIDER === "pluggy" && (!env.PLUGGY_CLIENT_ID || !env.PLUGGY_CLIENT_SECRET)) {
      ctx.addIssue({ code: "custom", path: ["PLUGGY_CLIENT_ID"], message: "Credenciais Pluggy ausentes." });
    }
    if (env.NODE_ENV === "production") {
      if (!env.AUTH_JWKS_URL) {
        ctx.addIssue({ code: "custom", path: ["AUTH_JWKS_URL"], message: "Obrigatório em produção." });
      }
      if (env.DEV_AUTH_TOKEN) {
        ctx.addIssue({
          code: "custom",
          path: ["DEV_AUTH_TOKEN"],
          message: "DEV_AUTH_TOKEN não pode existir em produção.",
        });
      }
      if (env.FINANCE_PROVIDER === "mock") {
        ctx.addIssue({ code: "custom", path: ["FINANCE_PROVIDER"], message: "Use um provedor real em produção." });
      }
    }
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração inválida:\n${msg}`);
  }
  return parsed.data;
}

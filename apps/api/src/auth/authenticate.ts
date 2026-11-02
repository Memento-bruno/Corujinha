import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Config } from "../config.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

/**
 * Autenticação + autorização em duas camadas:
 * 1. o token precisa ser válido (assinatura, emissor, audiência, expiração);
 * 2. o usuário precisa estar na lista fechada do casal (ALLOWED_USER_IDS).
 * Qualquer outra conta, mesmo autenticada, recebe 403.
 */
export function buildAuthenticate(config: Config) {
  const allowed = new Set(config.ALLOWED_USER_IDS);
  const jwks = config.AUTH_JWKS_URL ? createRemoteJWKSet(new URL(config.AUTH_JWKS_URL)) : undefined;
  const devToken = config.NODE_ENV !== "production" ? config.DEV_AUTH_TOKEN : undefined;

  async function resolveUser(token: string): Promise<string | undefined> {
    if (devToken && token.includes(":")) {
      const [secret, userId] = token.split(":", 2) as [string, string];
      return safeEqual(secret, devToken) ? userId : undefined;
    }
    if (!jwks) return undefined;
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.AUTH_ISSUER || undefined,
        audience: config.AUTH_AUDIENCE,
      });
      return typeof payload.sub === "string" ? payload.sub : undefined;
    } catch {
      return undefined;
    }
  }

  return async function authenticate(req: FastifyRequest, reply: FastifyReply) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const userId = token ? await resolveUser(token) : undefined;
    if (!userId) return reply.code(401).send({ error: "nao_autenticado" });
    if (!allowed.has(userId)) {
      req.log.warn({ userId }, "acesso negado: usuário fora da lista do casal");
      return reply.code(403).send({ error: "acesso_negado" });
    }
    req.userId = userId;
  };
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

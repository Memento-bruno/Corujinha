import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { MockProvider } from "./providers/mock.js";

const config = loadConfig({
  NODE_ENV: "test",
  ALLOWED_USER_IDS: "bruno,esposa",
  DEV_AUTH_TOKEN: "segredo-de-teste",
  CONSENT_MODE: "one_shot",
});
const as = (user: string) => ({ authorization: `Bearer segredo-de-teste:${user}` });

let provider: MockProvider;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  provider = new MockProvider();
  app = await buildApp(config, { provider });
});

describe("segurança", () => {
  it("health é público", async () => {
    expect((await app.inject({ url: "/health" })).statusCode).toBe(200);
  });

  it("sem token => 401", async () => {
    expect((await app.inject({ url: "/household" })).statusCode).toBe(401);
  });

  it("token com segredo errado => 401", async () => {
    const r = await app.inject({ url: "/household", headers: { authorization: "Bearer errado:bruno" } });
    expect(r.statusCode).toBe(401);
  });

  it("usuário autenticado mas fora do casal => 403", async () => {
    expect((await app.inject({ url: "/household", headers: as("intruso") })).statusCode).toBe(403);
  });

  it("recusa configuração com mais de 2 pessoas", () => {
    expect(() => loadConfig({ NODE_ENV: "test", ALLOWED_USER_IDS: "a,b,c" })).toThrow(/restrito ao casal/);
  });

  it("recusa token de desenvolvimento em produção", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        ALLOWED_USER_IDS: "a,b",
        DEV_AUTH_TOKEN: "x",
        FINANCE_PROVIDER: "pluggy",
        PLUGGY_CLIENT_ID: "id",
        PLUGGY_CLIENT_SECRET: "s",
        AUTH_JWKS_URL: "https://exemplo.supabase.co/auth/v1/.well-known/jwks.json",
      }),
    ).toThrow(/DEV_AUTH_TOKEN/);
  });
});

describe("fluxo do mês", () => {
  it("sincroniza, revoga consentimento, classifica e fecha o mês", async () => {
    const sync = await app.inject({ method: "POST", url: "/connections/item-bruno/sync", headers: as("bruno") });
    expect(sync.json()).toMatchObject({ cards: 1, bills: 1, consentRevoked: true });
    expect(provider.revoked.has("item-bruno")).toBe(true);

    const bills = await app.inject({ url: "/bills?month=2026-10", headers: as("esposa") });
    expect(bills.json().bills).toHaveLength(1);

    // Mercado e geladeira são da casa
    for (const t of ["item-bruno-t1", "item-bruno-t3"]) {
      const r = await app.inject({
        method: "PUT",
        url: `/transactions/${t}/allocation`,
        headers: as("bruno"),
        payload: { type: "shared" },
      });
      expect(r.statusCode).toBe(200);
    }

    // Aluguel pago pela esposa
    const rec = await app.inject({
      method: "POST",
      url: "/recurring-bills",
      headers: as("esposa"),
      payload: { description: "Aluguel", amount: 200_000, paidBy: "esposa", allocation: { type: "shared" }, dueDay: 5 },
    });
    expect(rec.statusCode).toBe(201);

    const s = (await app.inject({ url: "/settlement?month=2026-10", headers: as("bruno") })).json();
    // Compartilhado: 324,50 + 120,00 + 2000,00 = 2444,50 => metade 1222,25
    expect(s.sharedTotal).toBe(244_450);
    // Bruno pagou 487,90 do cartão; deve 1222,25 + pessoais (55,90 - 12,50) = 1265,65
    expect(s.transfers).toEqual([{ from: "bruno", to: "esposa", amount: 77_775 }]);
  });

  it("proporcional sem renda cadastrada => 422 com mensagem clara", async () => {
    const r = await app.inject({
      method: "PUT",
      url: "/household/rule",
      headers: as("bruno"),
      payload: { kind: "proportional_income" },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().message).toMatch(/Cadastre a remuneração/);
  });

  it("valida o corpo das requisições", async () => {
    const r = await app.inject({
      method: "PUT",
      url: "/household/me/income",
      headers: as("bruno"),
      payload: { monthlyIncome: -5 },
    });
    expect(r.statusCode).toBe(400);
  });
});

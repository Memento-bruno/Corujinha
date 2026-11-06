import { describe, expect, it } from "vitest";
import { demoConfig, demoStatements } from "../demo/seed";
import { monthRange } from "../domain/months";
import type { Transaction } from "../domain/types";
import { RuleBasedSavingsEngine, repeatedMerchants, simulateCuts } from "./savings";
import { detectRecurringMerchants, healthScore, projectInstallments } from "./analytics";

const END = "2026-10";
const statements = demoStatements(END);
const byMonth = Object.fromEntries(statements.map((s) => [s.month, s.transactions]));
const config = demoConfig();
const engine = new RuleBasedSavingsEngine({ month: END, byMonth, config });

describe("RuleBasedSavingsEngine com os dados de demonstração", () => {
  const recs = engine.analyze();
  const rules = new Set(recs.map((r) => r.rule));

  it("é determinístico", () => {
    const again = new RuleBasedSavingsEngine({ month: END, byMonth: Object.fromEntries(demoStatements(END).map((s) => [s.month, s.transactions])), config }).analyze();
    expect(again).toEqual(recs);
  });

  it("dispara as 4 regras de alerta", () => {
    expect(rules).toEqual(new Set(["DUPLICATE_SUBSCRIPTION", "SUBSCRIPTION_INFLATION", "SECTOR_OVERRUN", "HIGH_FREQUENCY"]));
  });

  it("detecta Spotify nos dois cartões", () => {
    const dup = recs.find((r) => r.id === "dup-merchant-spotify");
    expect(dup).toBeDefined();
    expect(dup!.monthlySavings).toBe(2190);
  });

  it("detecta 3 streamings de vídeo", () => {
    const g = recs.find((r) => r.id === "dup-group-Streaming de vídeo");
    expect(g?.details.kind === "duplicate" && g.details.merchants.length).toBe(3);
  });

  it("detecta aumento da Disney+", () => {
    const r = recs.find((x) => x.rule === "SUBSCRIPTION_INFLATION" && x.title.startsWith("Disney"));
    expect(r?.monthlySavings).toBe(300);
  });

  it("aponta iFood como gasto formiguinha com cortes de 30% e 50%", () => {
    const r = recs.find((x) => x.id === "freq-m-ifood");
    expect(r?.details.kind).toBe("frequency");
    if (r?.details.kind === "frequency") {
      expect(r.details.occurrences).toBe(16);
      expect(r.details.cut50).toBe(Math.round(r.details.total * 0.5));
    }
  });

  it("não alerta setores essenciais", () => {
    expect(recs.some((r) => r.details.kind === "overrun" && r.details.category === "mercado")).toBe(false);
  });

  it("simulador soma itens marcados e calcula % da fatura", () => {
    const c = engine.simulatorCandidates();
    expect(c[0].kind).toBe("subscription");
    const pick = new Set(c.slice(0, 2).map((x) => x.id));
    const r = simulateCuts(c, pick, 100000);
    expect(r.savings).toBe(c[0].monthlyAmount + c[1].monthlyAmount);
    expect(r.pctOfInvoice).toBeCloseTo((r.savings / 100000) * 100);
  });
});

describe("simulador: assinaturas e recorrentes", () => {
  const tx = (id: string, date: string, merchantKey: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
    id,
    date,
    description: merchantKey.toUpperCase(),
    merchantKey,
    amount,
    cardId: "c1",
    paidBy: "USER_A",
    category: "servicos",
    tags: [],
    split: { mode: "DEFAULT" },
    source: "manual",
    ...extra,
  } as Transaction);
  const hist = {
    "2026-09": [tx("a", "2026-09-05", "nutag", 7000), tx("b", "2026-09-07", "academia", 12000)],
    "2026-10": [
      tx("c", "2026-10-05", "nutag", 7288),
      tx("d", "2026-10-07", "academia", 12000),
      tx("e", "2026-10-09", "pedagio novo", 900),
      tx("f", "2026-10-10", "mercado x", 30000, { category: "mercado" }),
      tx("p", "2026-10-15", "conta luz", 15000, { predictedFrom: "r1", tags: ["Prevista"] }),
    ],
  };

  it("loja que já apareceu antes conta como recorrente, mesmo de setor essencial", () => {
    const rec = repeatedMerchants(hist, "2026-10");
    expect([...rec].sort()).toEqual(["academia", "nutag"]);
    const c = new RuleBasedSavingsEngine({ month: "2026-10", byMonth: hist, config }).simulatorCandidates(rec);
    const subs = c.filter((x) => x.kind === "subscription").map((x) => x.id).sort();
    expect(subs).toEqual(["s|academia", "s|conta luz", "s|nutag"]);
    // essencial e sem repetição continua fora
    expect(c.some((x) => x.id.endsWith("mercado x"))).toBe(false);
  });

  it("parcela marcada como assinatura entra; parcela comum não", () => {
    const m = {
      "2026-10": [
        tx("x", "2026-10-02", "plano anual", 5000, { installment: { current: 2, total: 12 }, tags: ["Assinatura"] }),
        tx("y", "2026-10-03", "geladeira", 40000, { installment: { current: 2, total: 10 }, category: "compras" }),
      ],
    };
    const ids = new RuleBasedSavingsEngine({ month: "2026-10", byMonth: m, config }).simulatorCandidates().map((c) => c.id);
    expect(ids).toEqual(["s|plano anual"]);
  });

  it("muitas compras no mês na mesma loja ficam em gastos variáveis", () => {
    const many = { ...hist, "2026-10": [1, 2, 3, 4].map((i) => tx(`i${i}`, "2026-10-1" + i, "ifood", 3000, { category: "delivery" })), "2026-09": [tx("z", "2026-09-01", "ifood", 3000)] };
    expect(repeatedMerchants(many, "2026-10").has("ifood")).toBe(false);
  });
});

describe("analytics", () => {
  it("sugere Google One como assinatura pela repetição mensal", () => {
    expect(detectRecurringMerchants(byMonth, END, 3)).toContain("google one");
  });

  it("projeta parcelas futuras (03/10 gera mais 7)", () => {
    const p = projectInstallments(byMonth[END] as Transaction[], END, 12);
    const fridge = p.flatMap((m) => m.items).filter((i) => i.description.startsWith("Magalu"));
    expect(fridge).toHaveLength(7);
    expect(fridge[0].label).toBe("04/10");
    expect(fridge.at(-1)!.label).toBe("10/10");
  });

  it("score de saúde: 100 abaixo de 80% da meta e 0 acima de 150%", () => {
    expect(healthScore(70, 100, []).score).toBe(100);
    expect(healthScore(100, 100, []).score).toBe(75);
    expect(healthScore(160, 100, []).score).toBe(0);
    expect(healthScore(70, 100, [{ category: "delivery", amount: 10, count: 1, budget: 5 }]).score).toBe(95);
  });

  it("demo cobre 6 meses", () => {
    expect(statements.map((s) => s.month)).toEqual(monthRange(END, 6));
  });
});

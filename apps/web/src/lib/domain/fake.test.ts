import { describe, expect, it } from "vitest";
import { changesAmounts, configChangesAmounts, fakeAmount, fakeConfig, fakeStatement, globalFactor, itemFactor, restoreAmounts } from "./fake";
import type { HouseholdConfig, StatementFile, Transaction } from "./types";

const tx = (id: string, amount: number, merchantKey = "ifood", description = "iFood"): Transaction => ({
  id,
  date: "2026-11-01",
  description,
  merchantKey,
  amount,
  cardId: "c1",
  paidBy: "USER_A",
  category: "delivery",
  tags: [],
  split: { type: "INDIVIDUAL_A" },
  source: "manual",
});

describe("valores fictícios", () => {
  it("mantém os mesmos itens e só troca o valor", () => {
    const s: StatementFile = { schemaVersion: 1, month: "2026-11", transactions: [tx("a", 5000), tx("b", -1200, "netflix", "Netflix")], updatedAt: "" };
    const f = fakeStatement(123, s);
    expect(f.transactions.map((t) => t.id)).toEqual(["a", "b"]);
    expect(f.transactions.map((t) => t.description)).toEqual(["iFood", "Netflix"]);
    expect(f.transactions[0].amount).not.toBe(5000);
    expect(f.transactions[1].amount).toBeLessThan(0); // estorno continua estorno
    expect(s.transactions[0].amount).toBe(5000); // original intacto
  });

  it("a mesma loja tem o mesmo fator em qualquer mês (parcelas batem)", () => {
    expect(fakeAmount(7, tx("x", 10000))).toBe(fakeAmount(7, tx("y", 10000)));
  });

  it("muda com a semente e fica dentro de uma faixa plausível", () => {
    expect(fakeAmount(1, tx("x", 10000))).not.toBe(fakeAmount(2, tx("x", 10000)));
    for (let seed = 1; seed < 200; seed++) {
      expect(globalFactor(seed)).toBeGreaterThanOrEqual(0.55);
      expect(globalFactor(seed)).toBeLessThanOrEqual(1.6);
      const f = itemFactor(seed, "m:loja");
      expect(f).toBeGreaterThan(0.3);
      expect(f).toBeLessThan(2.5);
    }
  });

  it("valor pequeno nunca vira zero", () => {
    expect(fakeAmount(5, tx("x", 1))).toBe(1);
  });

  it("detecta gravação que mudaria valor e devolve o real quando o formulário só repetiu o fictício", () => {
    const real = [tx("a", 5000)];
    const shown = fakeAmount(9, real[0]);
    expect(changesAmounts(real, [{ ...real[0], split: { type: "SHARED_DEFAULT" } }])).toBe(false);
    expect(changesAmounts(real, [{ ...real[0], amount: shown }])).toBe(true);
    expect(changesAmounts(real, [...real, tx("novo", 100)])).toBe(true);
    const back = restoreAmounts(9, real, [{ ...real[0], amount: shown, description: "Outro nome" }]);
    expect(back[0].amount).toBe(5000);
    expect(back[0].description).toBe("Outro nome");
  });

  it("troca meta, renda e tetos do config", () => {
    const c = { monthlyGoal: 500000, incomes: { USER_A: 800000 }, sectorBudgets: { mercado: 100000 } } as unknown as HouseholdConfig;
    const f = fakeConfig(3, c);
    expect(f.monthlyGoal).not.toBe(500000);
    expect(configChangesAmounts(c, f)).toBe(true);
    expect(configChangesAmounts(c, { ...c })).toBe(false);
  });
});

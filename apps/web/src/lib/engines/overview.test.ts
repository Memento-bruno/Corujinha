import { describe, expect, it } from "vitest";
import type { RecurringDebt, Transaction } from "../domain/types";
import { billsPaidRatio, cardTxsFor, financialHealth, incomeUsage, monthComposition, monthSpend } from "./overview";

const aluguel: RecurringDebt = {
  id: "rec-aluguel",
  description: "Aluguel",
  kind: "BOLETO",
  amount: 250000,
  paidBy: "USER_A",
  split: { type: "SHARED_DEFAULT" },
  category: "moradia",
  dueDay: 5,
  startMonth: "2026-01",
  active: true,
};

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: "t",
    date: "2026-12-05",
    description: "X",
    merchantKey: "x",
    amount: 10000,
    cardId: "card-a",
    paidBy: "USER_A",
    category: "outros",
    tags: [],
    split: { type: "SHARED_DEFAULT" },
    source: "pluggy",
    ...p,
  };
}

describe("visão geral", () => {
  it("soma cartão e contas fora do cartão e marca aperto acima da meta", () => {
    const s = monthSpend([tx({ amount: 60000 })], [aluguel], "2026-11", "2026-12", 300000);
    expect(s).toMatchObject({ card: 60000, bills: 250000, total: 310000, status: "over", forecast: false });
    expect(monthSpend([tx({})], [aluguel], "2027-01", "2026-12", 300000).status).toBe("forecast");
    expect(monthSpend([tx({})], [aluguel], "2026-12", "2026-12", 300000).status).toBe("open");
  });

  it("prevê meses futuros com as parcelas que já existem", () => {
    const byMonth = { "2026-12": [tx({ id: "tv", amount: 50000, installment: { current: 3, total: 4 } }), tx({ id: "pizza", amount: 8000 })] };
    expect(cardTxsFor(byMonth, [], "2027-01", "2026-12").map((t) => t.installment)).toEqual([{ current: 4, total: 4 }]);
    expect(cardTxsFor(byMonth, [], "2027-02", "2026-12")).toEqual([]);
  });

  it("separa contas, parcelas e categorias", () => {
    const parts = monthComposition(
      [tx({ amount: 1000, category: "mercado" }), tx({ amount: 2000, installment: { current: 1, total: 3 }, category: "compras" }), tx({ amount: 500, category: "delivery" })],
      [aluguel],
      "2026-12",
    );
    expect(parts).toEqual({ contas: 250000, parcelas: 2000, mercado: 1000, restaurantes: 500, compras: 0, outros: 0 });
  });

  it("calcula a renda usada sem precisar mostrar salários", () => {
    const u = incomeUsage(500000, { USER_A: 200000, USER_B: 300000 }, { USER_A: 500000, USER_B: 500000 });
    expect(u.couple).toBe(50);
    expect(u.perUser).toEqual({ USER_A: 40, USER_B: 60 });
    expect(incomeUsage(1, { USER_A: 1, USER_B: 0 }, { USER_A: 100 }).couple).toBeNull();
  });

  it("dá nota 100 com tudo em dia e cai com meta estourada", () => {
    expect(financialHealth({ spent: 100, goal: 1000, income: 2000, futureInstallments: 0, paidRatio: 1 }).score).toBe(100);
    const h = financialHealth({ spent: 1300, goal: 1000, income: 0, futureInstallments: 0, paidRatio: 1 });
    expect(h.factors.map((f) => f.key)).toEqual(["meta", "parcelas", "contas"]);
    expect(h.score).toBe(67);
    expect(h.worst?.key).toBe("meta");
    expect(billsPaidRatio({ a: { total: 1000, paid: 500, status: "parcial" } })).toBe(0.5);
    expect(billsPaidRatio(undefined)).toBe(1);
  });
});

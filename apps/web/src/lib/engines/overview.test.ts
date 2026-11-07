import { describe, expect, it } from "vitest";
import type { RecurringDebt, Transaction } from "../domain/types";
import { billsPaidRatio, cardTxsFor, financialHealth, incomeUsage, monthComposition, monthSpend, onTimeRatio } from "./overview";
import { addDays, currentMonthBR, todayBR } from "../domain/months";

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

describe("correções da revisão de bugs", () => {
  it("fatura em aberto sem compras do banco ainda conta as parcelas que já existem", () => {
    const byMonth = { "2026-11": [tx({ id: "tv", amount: 50000, installment: { current: 2, total: 4 } })], "2026-12": [] };
    expect(cardTxsFor(byMonth, [], "2026-12", "2026-12").map((t) => t.installment)).toEqual([{ current: 3, total: 4 }]);
    // Mês que já passou fica como está.
    expect(cardTxsFor({ "2026-10": [] , "2026-09": byMonth["2026-11"] }, [], "2026-10", "2026-12")).toEqual([]);
    // Com compra real do banco, vale o que chegou.
    const real = { ...byMonth, "2026-12": [tx({ id: "pizza" })] };
    expect(cardTxsFor(real, [], "2026-12", "2026-12").map((t) => t.id)).toEqual(["pizza"]);
  });

  it("conta vencida sem 'Já paguei' derruba 'Contas pagas em dia'", () => {
    const base = { bankBillsMonth: "2026-11", debts: [aluguel], month: "2026-12" };
    expect(onTimeRatio({ ...base, today: "2026-12-04" })).toBe(1); // ainda não venceu
    expect(onTimeRatio({ ...base, today: "2026-12-10" })).toBe(0);
    expect(onTimeRatio({ ...base, debts: [{ ...aluguel, paidMonths: ["2026-12"] }], today: "2026-12-10" })).toBe(1);
    // Fatura marcada como paga no app conta como paga.
    const bankBills = { "card-a": { total: 1000, paid: 0, status: "em aberto" as const } };
    expect(onTimeRatio({ ...base, debts: [], bankBills, today: "2026-12-10" })).toBe(0);
    expect(onTimeRatio({ ...base, debts: [], bankBills, paidCardBills: ["card-a|2026-11"], today: "2026-12-10" })).toBe(1);
  });

  it("vira o dia e o mês pelo horário de Brasília", () => {
    const night = new Date("2026-11-30T23:30:00-03:00"); // 02:30 de 01/12 em UTC
    expect(todayBR(night)).toBe("2026-11-30");
    expect(currentMonthBR(night)).toBe("2026-11");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

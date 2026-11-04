import { describe, expect, it } from "vitest";
import type { Expense, RecurringDebt } from "../domain/types";
import { isDebtActiveIn, settle, splitAmount } from "./settlement";

const e = (p: Partial<Expense> & Pick<Expense, "amount" | "paidBy" | "split">): Expense => ({
  id: Math.random().toString(),
  description: "x",
  origin: "CARD",
  ...p,
});

describe("splitAmount", () => {
  it("divide meio a meio sem perder centavos", () => {
    expect(splitAmount(1001, { type: "SHARED_DEFAULT" }, 50)).toEqual({ shareA: 501, shareB: 500 });
  });
  it("respeita percentual customizado e individuais", () => {
    expect(splitAmount(10000, { type: "SHARED_CUSTOM", percentA: 70 }, 50)).toEqual({ shareA: 7000, shareB: 3000 });
    expect(splitAmount(999, { type: "INDIVIDUAL_A" }, 50)).toEqual({ shareA: 999, shareB: 0 });
    expect(splitAmount(999, { type: "INDIVIDUAL_B" }, 50)).toEqual({ shareA: 0, shareB: 999 });
  });
  it("divide estornos com o mesmo critério", () => {
    expect(splitAmount(-1001, { type: "SHARED_DEFAULT" }, 50)).toEqual({ shareA: -501, shareB: -500 });
  });
  it("rejeita percentual inválido", () => {
    expect(() => splitAmount(100, { type: "SHARED_CUSTOM", percentA: 120 }, 50)).toThrow();
  });
});

describe("settle (encontro de contas)", () => {
  it("compensa créditos cruzados e gera uma única transferência", () => {
    const r = settle(
      [
        // A pagou 1000 conjunto => B deve 500
        e({ amount: 100000, paidBy: "USER_A", split: { type: "SHARED_DEFAULT" } }),
        // B comprou algo só dele no cartão de A => B deve 200
        e({ amount: 20000, paidBy: "USER_A", split: { type: "INDIVIDUAL_B" } }),
        // B pagou 400 conjunto => A deve 200
        e({ amount: 40000, paidBy: "USER_B", split: { type: "SHARED_DEFAULT" } }),
        // A comprou algo só dele no cartão de B => A deve 100
        e({ amount: 10000, paidBy: "USER_B", split: { type: "INDIVIDUAL_A" } }),
        // Recorrente paga por B, 60% de A => A deve 600
        e({ amount: 100000, paidBy: "USER_B", split: { type: "SHARED_CUSTOM", percentA: 60 }, origin: "RECURRING" }),
      ],
      50,
    );
    expect(r.credits.USER_A).toMatchObject({ sharedCard: 50000, individualOnMyCard: 20000, total: 70000 });
    expect(r.credits.USER_B).toMatchObject({ sharedCard: 20000, individualOnMyCard: 10000, sharedRecurring: 60000, total: 90000 });
    expect(r.crossOffset).toBe(70000);
    expect(r.transfer).toEqual({ from: "USER_A", to: "USER_B", amount: 20000 });
    expect(r.grossTotal).toBe(270000);
    expect(r.fairShare.USER_A + r.fairShare.USER_B).toBe(r.grossTotal);
    // Invariante: quem paga o acerto acaba arcando exatamente com sua parte justa
    expect(r.paid.USER_A + r.transfer!.amount).toBe(r.fairShare.USER_A);
  });

  it("zera quando tudo se compensa", () => {
    const r = settle(
      [
        e({ amount: 10000, paidBy: "USER_A", split: { type: "SHARED_DEFAULT" } }),
        e({ amount: 10000, paidBy: "USER_B", split: { type: "SHARED_DEFAULT" } }),
      ],
      50,
    );
    expect(r.transfer).toBeNull();
  });

  it("respeita a divisão padrão proporcional", () => {
    const r = settle([e({ amount: 10000, paidBy: "USER_A", split: { type: "SHARED_DEFAULT" } })], 60);
    expect(r.transfer).toEqual({ from: "USER_B", to: "USER_A", amount: 4000 });
  });
});

describe("isDebtActiveIn", () => {
  const debt: RecurringDebt = {
    id: "d", description: "Carro", kind: "FINANCIAMENTO", amount: 1, paidBy: "USER_A",
    split: { type: "SHARED_DEFAULT" }, category: "outros", dueDay: 1, startMonth: "2026-01", totalInstallments: 3, active: true,
  };
  it("vale só entre o início e a última parcela", () => {
    expect(isDebtActiveIn(debt, "2025-12")).toBe(false);
    expect(isDebtActiveIn(debt, "2026-01")).toBe(true);
    expect(isDebtActiveIn(debt, "2026-03")).toBe(true);
    expect(isDebtActiveIn(debt, "2026-04")).toBe(false);
    expect(isDebtActiveIn({ ...debt, active: false }, "2026-02")).toBe(false);
  });
});

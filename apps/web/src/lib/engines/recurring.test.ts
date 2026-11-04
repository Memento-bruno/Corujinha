import { describe, expect, it } from "vitest";
import type { RecurringDebt, Transaction } from "../domain/types";
import { applyCardRecurring, predictCardRecurring, withPredicted } from "./recurring";
import { recurringToExpenses, settleMonth } from "./settlement";

const netflix: RecurringDebt = {
  id: "rec-1",
  description: "Netflix",
  kind: "CARTAO",
  amount: 5590,
  paidBy: "USER_A",
  split: { type: "INDIVIDUAL_B" },
  category: "assinaturas",
  dueDay: 31,
  startMonth: "2026-11",
  active: true,
  cardId: "card-a",
  merchantKey: "netflix",
};

const boleto: RecurringDebt = {
  id: "rec-2",
  description: "Condomínio",
  kind: "BOLETO",
  amount: 80000,
  paidBy: "USER_B",
  split: { type: "SHARED_DEFAULT" },
  category: "moradia",
  dueDay: 10,
  startMonth: "2026-11",
  totalInstallments: 1,
  active: true,
};

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: "t1",
    date: "2026-12-05",
    description: "NETFLIX.COM",
    merchantKey: "netflix",
    amount: 5990,
    cardId: "card-a",
    paidBy: "USER_A",
    category: "outros",
    tags: [],
    split: { type: "SHARED_DEFAULT" },
    source: "pluggy",
    ...p,
  };
}

describe("compras recorrentes no cartão", () => {
  it("prevê a compra no mês em que o banco ainda não trouxe", () => {
    const [p] = predictCardRecurring([netflix], "2026-12", []);
    expect(p).toMatchObject({ amount: 5590, cardId: "card-a", split: { type: "INDIVIDUAL_B" }, predictedFrom: "rec-1", date: "2026-12-31" });
    // Fevereiro tem 28 dias.
    expect(predictCardRecurring([netflix], "2027-02", [])[0].date).toBe("2027-02-28");
  });

  it("some quando a compra real chega, e não prevê antes de começar ou se pausada", () => {
    expect(predictCardRecurring([netflix], "2026-12", [tx({})])).toHaveLength(0);
    expect(predictCardRecurring([netflix], "2026-10", [])).toHaveLength(0);
    expect(predictCardRecurring([{ ...netflix, active: false }], "2026-12", [])).toHaveLength(0);
    // Outro cartão não conta como "chegou".
    expect(predictCardRecurring([netflix], "2026-12", [tx({ cardId: "card-b" })])).toHaveLength(1);
  });

  it("compra nova do banco herda divisão e setor da recorrente", () => {
    const t = applyCardRecurring([netflix], tx({}));
    expect(t.split).toEqual({ type: "INDIVIDUAL_B" });
    expect(t.category).toBe("assinaturas");
    expect(applyCardRecurring([netflix], tx({ merchantKey: "spotify" })).split).toEqual({ type: "SHARED_DEFAULT" });
  });
});

describe("encontro de contas com boletos e previstas", () => {
  it("recorrente de cartão não entra como conta fora do cartão", () => {
    expect(recurringToExpenses([netflix, boleto], "2026-11").map((e) => e.id)).toEqual(["recurring:rec-2"]);
  });

  it("conta avulsa vale só no mês dela", () => {
    expect(recurringToExpenses([boleto], "2026-11")).toHaveLength(1);
    expect(recurringToExpenses([boleto], "2026-12")).toHaveLength(0);
  });

  it("acerto inclui a prevista e o boleto, sem contar a prevista duas vezes", () => {
    const r = settleMonth("2026-11", [], [netflix, boleto], 50);
    // Netflix 100% da B no cartão de A: A tem crédito de 55,90. Boleto pago por B, metade de A: 400,00.
    expect(r.credits.USER_A.total).toBe(5590);
    expect(r.credits.USER_B.total).toBe(40000);
    const again = settleMonth("2026-11", withPredicted([netflix], "2026-11", []), [netflix, boleto], 50);
    expect(again.grossTotal).toBe(r.grossTotal);
  });
});

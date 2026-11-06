import { describe, expect, it } from "vitest";
import { demoConfig } from "../demo/seed";
import type { Transaction } from "../domain/types";
import { billInClosing, cardBillsByOwner } from "./card-bills";

const cfg = demoConfig();
let n = 0;
const tx = (cardId: string, amount: number, p: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`,
  date: "2026-11-05",
  description: "Compra",
  merchantKey: "compra",
  amount,
  cardId,
  paidBy: "USER_A",
  category: "compras",
  tags: [],
  split: { type: "SHARED_DEFAULT" },
  source: "pluggy",
  ...p,
});

describe("faturas pagas por pessoa", () => {
  it("separa por dono, soma o que falta e respeita a marca Já paguei", () => {
    const r = cardBillsByOwner({
      month: "2026-12",
      cards: cfg.cards,
      transactions: [tx("card-a-nu", 10000), tx("card-a-itau", 5000), tx("card-b-inter", 3000), tx("card-b-xp", 2000, { predictedFrom: "x" })],
      marks: ["card-a-itau|2026-12"],
    });
    expect(r.USER_A.rows.map((x) => [x.card.id, x.status])).toEqual([
      ["card-a-nu", "pendente"],
      ["card-a-itau", "paga"],
    ]);
    expect(r.USER_A.pending).toBe(10000);
    expect(r.USER_A.pendingCount).toBe(1);
    // Só previsão não vira fatura.
    expect(r.USER_B.rows.map((x) => x.card.id)).toEqual(["card-b-inter"]);
  });

  it("usa o total e a situação do banco quando existem", () => {
    const r = cardBillsByOwner({
      month: "2026-12",
      cards: cfg.cards,
      transactions: [tx("card-b-inter", 1)],
      bankBills: {
        "card-b-inter": { total: 50000, paid: 20000, status: "parcial", dueDate: "2026-12-10" },
        "card-b-xp": { total: 8000, paid: 8000, status: "paga", dueDate: "2026-12-05" },
      },
    });
    expect(r.USER_B.rows.map((x) => [x.card.id, x.status, x.total])).toEqual([
      ["card-b-inter", "parcial", 50000],
      ["card-b-xp", "paga-banco", 8000],
    ]);
    expect(r.USER_B.pending).toBe(30000);
  });

  it("fatura que venceu até a data do fechamento conta como acertada", () => {
    const closing = { date: "2026-11-03", closedAt: "", closedBy: "USER_A" as const };
    expect(billInClosing("2026-11", "2026-11-01", closing)).toBe(true);
    expect(billInClosing("2026-11", "2026-11-10", closing)).toBe(false);
    expect(billInClosing("2026-10", undefined, closing)).toBe(true);
    expect(billInClosing("2026-11", undefined, closing)).toBe(false);
    const r = cardBillsByOwner({
      month: "2026-11",
      cards: cfg.cards,
      transactions: [tx("card-a-nu", 100)],
      bankBills: { "card-a-itau": { total: 900, paid: 0, status: "em aberto", dueDate: "2026-11-02" } },
      closing,
    });
    expect(r.USER_A.rows.map((x) => [x.card.id, x.status])).toEqual([
      ["card-a-nu", "pendente"],
      ["card-a-itau", "fechada"],
    ]);
  });
});

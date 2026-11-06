import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { RecurringDebt, Transaction } from "../domain/types";
import { convertMonthToOwnerPays, forgetLearnedSplits } from "./owner-pays";

const tx = (o: Partial<Transaction>): Transaction => ({
  id: "t",
  date: "2026-11-02",
  description: "C&A",
  merchantKey: "cea",
  amount: 10000,
  cardId: "card-b",
  paidBy: "USER_B",
  category: "compras",
  tags: [],
  split: { type: "SHARED_DEFAULT" },
  source: "pluggy",
  ...o,
});

const cfg = {
  cards: [
    { id: "card-a", owner: "USER_A" as const, nickname: "Santander", last4: "1111", brand: "visa" as const, theme: 0 },
    { id: "card-b", owner: "USER_B" as const, nickname: "Nubank", last4: "2222", brand: "mastercard" as const, theme: 1 },
  ],
};

describe("conversão: compra de cartão é do dono da fatura", () => {
  it("passa as compras para o dono do cartão, inclusive as marcadas para o outro", () => {
    const r = convertMonthToOwnerPays(
      [tx({ id: "1" }), tx({ id: "2", cardId: "card-a", paidBy: "USER_A", split: { type: "INDIVIDUAL_B" } }), tx({ id: "3", split: { type: "INDIVIDUAL_B" } })],
      cfg,
      [],
    );
    expect(r.changed).toBe(2);
    expect(r.transactions.map((t) => t.split.type)).toEqual(["INDIVIDUAL_B", "INDIVIDUAL_A", "INDIVIDUAL_B"]);
  });

  it("não mexe em compra de recorrente de cartão (a divisão dela foi escolhida à mão)", () => {
    const debt = { id: "d", kind: "CARTAO", active: true, cardId: "card-b", merchantKey: "netflix" } as RecurringDebt;
    const r = convertMonthToOwnerPays([tx({ merchantKey: "netflix" })], cfg, [debt]);
    expect(r.changed).toBe(0);
  });

  it("esquece 'quem paga' aprendido sozinho e mantém o setor", () => {
    const out = forgetLearnedSplits({
      cea: { name: "C&A", category: "compras", split: { type: "INDIVIDUAL_A" }, updatedAt: "x" },
      ifood: { name: "iFood", split: { type: "SHARED_DEFAULT" }, updatedAt: "x" },
    });
    expect(out).toEqual({ cea: { name: "C&A", category: "compras", updatedAt: "x" } });
  });
});

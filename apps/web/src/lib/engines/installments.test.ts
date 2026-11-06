import { describe, expect, it } from "vitest";
import type { Transaction } from "../domain/types";
import { isSamePurchase } from "./installments";

const t = (current: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${current}`,
  date: "2026-10-01",
  description: "TV",
  merchantKey: "tv",
  amount: 10000,
  cardId: "c1",
  paidBy: "USER_A",
  category: "compras",
  tags: [],
  split: { type: "SHARED_DEFAULT" },
  installment: { current, total: 10 },
  source: "pluggy",
  ...extra,
});

describe("isSamePurchase", () => {
  it("acha as outras parcelas da mesma compra", () => {
    expect(isSamePurchase("2026-11", t(3), "2027-01", t(5))).toBe(true);
    expect(isSamePurchase("2026-11", t(3), "2027-01", t(4))).toBe(false);
    expect(isSamePurchase("2026-11", t(3), "2027-01", t(5, { cardId: "c2" }))).toBe(false);
    expect(isSamePurchase("2026-11", t(3, { installment: undefined }), "2027-01", t(5))).toBe(false);
  });
});

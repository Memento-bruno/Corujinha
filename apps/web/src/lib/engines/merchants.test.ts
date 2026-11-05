import { describe, expect, it } from "vitest";
import type { Transaction } from "../domain/types";
import { applyMerchantRule, learnMerchant, propagateToSameMerchant } from "./merchants";

const tx = (o: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  date: "2026-11-02",
  description: "DROGASIL 123",
  merchantKey: "drogasil",
  amount: 5730,
  cardId: "c1",
  paidBy: "USER_A",
  category: "outros",
  tags: [],
  split: { type: "SHARED_DEFAULT" },
  source: "pluggy",
  ...o,
});

describe("memória de fornecedores", () => {
  it("aprende setor e divisão e aplica na compra nova", () => {
    let rules = learnMerchant(undefined, tx(), { category: "farmacia" }, "2026-11-01");
    rules = learnMerchant(rules, tx(), { split: { type: "SHARED_CUSTOM", percentA: 70 } }, "2026-11-02");
    expect(rules.drogasil).toMatchObject({ category: "farmacia", split: { type: "SHARED_CUSTOM", percentA: 70 } });
    const n = applyMerchantRule(rules, tx({ id: "t2" }));
    expect(n.category).toBe("farmacia");
    expect(n.split).toEqual({ type: "SHARED_CUSTOM", percentA: 70 });
  });

  it("não mexe em fornecedor desconhecido nem sem regra", () => {
    const rules = learnMerchant(undefined, tx({ merchantKey: "desconhecido" }), { category: "mercado" });
    expect(rules).toEqual({});
    expect(applyMerchantRule({}, tx())).toEqual(tx());
  });

  it("passa a mudança para as outras compras do mesmo fornecedor que estavam iguais", () => {
    const before = tx();
    const after = { ...before, category: "farmacia" as const, split: { type: "INDIVIDUAL_B" as const } };
    const list = [
      before,
      tx({ id: "t2" }),
      tx({ id: "t3", split: { type: "INDIVIDUAL_A" } }),
      tx({ id: "t4", merchantKey: "ifood" }),
    ];
    const r = propagateToSameMerchant(list, before, after);
    expect(r.changed).toBe(2);
    expect(r.transactions[1]).toMatchObject({ category: "farmacia", split: { type: "INDIVIDUAL_B" } });
    // t3 tinha divisão própria: só o setor muda
    expect(r.transactions[2]).toMatchObject({ category: "farmacia", split: { type: "INDIVIDUAL_A" } });
    expect(r.transactions[3].category).toBe("outros");
  });
});

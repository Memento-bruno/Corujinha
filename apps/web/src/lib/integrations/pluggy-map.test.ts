import { describe, expect, it } from "vitest";
import type { CreditCard, Transaction } from "../domain/types";
import { brandOf, expenseSign, last4Of, mapCardTransactions, mergeNew, resolveCard, type PluggyTransaction } from "./pluggy-map";

const card: CreditCard = { id: "card-1", owner: "USER_A", nickname: "Nubank", last4: "1234", brand: "mastercard", theme: 0 };

function tx(id: string, amount: number, extra: Partial<PluggyTransaction> = {}): PluggyTransaction {
  return { id, description: `LOJA ${id}`, amount, date: "2026-10-05T12:00:00.000Z", ...extra };
}

describe("pluggy-map", () => {
  it("extrai os 4 últimos dígitos e a bandeira", () => {
    expect(last4Of(null, "**** 9876")).toBe("9876");
    expect(last4Of("12")).toBeNull();
    expect(brandOf("MASTERCARD")).toBe("mastercard");
    expect(brandOf("Visa Infinite")).toBe("visa");
    expect(brandOf(undefined)).toBe("outra");
  });

  it("reaproveita o cartão do mesmo titular com os mesmos 4 dígitos", () => {
    const r = resolveCard({ id: "abcdef123456", type: "CREDIT", number: "5555********1234" }, "USER_A", [card]);
    expect(r).toEqual({ card, created: false });
    const other = resolveCard({ id: "abcdef123456", type: "CREDIT", number: "1234" }, "USER_B", [card]);
    expect(other.created).toBe(true);
    expect(other.card).toMatchObject({ id: "card-pluggy-abcdef12", owner: "USER_B", last4: "1234" });
  });

  it("detecta a convenção de sinal pela maioria das compras", () => {
    expect(expenseSign([tx("1", 10), tx("2", 20), tx("3", -5)])).toBe(1);
    expect(expenseSign([tx("1", -10), tx("2", -20), tx("3", 5)])).toBe(-1);
  });

  it("converte para centavos positivos, ignora pendentes e pagamento de fatura", () => {
    const out = mapCardTransactions(
      [
        tx("a", -12.34),
        tx("b", -50, { status: "PENDING" }),
        tx("c", 900, { description: "Pagamento de fatura" }),
        tx("d", -7.5),
        tx("e", 3), // estorno
      ],
      card,
      [],
      [],
    );
    const list = out.get("2026-10")!;
    expect(list.map((t) => [t.externalId, t.amount])).toEqual([
      ["pluggy:a", 1234],
      ["pluggy:d", 750],
      ["pluggy:e", -300],
    ]);
    expect(list[0]).toMatchObject({ cardId: "card-1", paidBy: "USER_A", source: "pluggy", split: { type: "SHARED_DEFAULT" } });
  });

  it("usa o mês de vencimento da fatura e as parcelas", () => {
    const out = mapCardTransactions(
      [tx("p", 100, { creditCardMetadata: { billId: "bill-1", installmentNumber: 2, totalInstallments: 10 } })],
      card,
      [{ id: "bill-1", dueDate: "2026-11-10" }],
      [],
    );
    const t = out.get("2026-11")![0];
    expect(t.installment).toEqual({ current: 2, total: 10 });
    expect(out.has("2026-10")).toBe(false);
  });

  it("não duplica nem altera transações já existentes", () => {
    const existing = mapCardTransactions([tx("a", 10)], card, [], []).get("2026-10")!;
    const edited: Transaction[] = existing.map((t) => ({ ...t, split: { type: "INDIVIDUAL_B" } }));
    const incoming = mapCardTransactions([tx("a", 10), tx("b", 20)], card, [], []).get("2026-10")!;
    const r = mergeNew(edited, incoming);
    expect(r.added).toBe(1);
    expect(r.merged.find((t) => t.externalId === "pluggy:a")!.split.type).toBe("INDIVIDUAL_B");
  });
});

describe("configSchema", () => {
  it("aceita tetos só para alguns setores e conexões Pluggy", async () => {
    const { configSchema } = await import("../server/schemas");
    const { demoConfig } = await import("../demo/seed");
    const cfg = { ...demoConfig(), pluggyItems: [{ itemId: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0", owner: "USER_A" }] };
    expect(configSchema.safeParse(cfg).success).toBe(true);
    expect(configSchema.safeParse({ ...cfg, pluggyItems: [{ itemId: "nope", owner: "USER_A" }] }).success).toBe(false);
  });
});

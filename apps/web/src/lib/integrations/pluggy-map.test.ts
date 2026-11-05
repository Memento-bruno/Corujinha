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

  it("converte para centavos positivos, inclui pendentes e ignora pagamento de fatura", () => {
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
      ["pluggy:b", 5000],
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

describe("valores e pagamentos", () => {
  it("usa o valor em reais nas compras internacionais", async () => {
    const { brlAmount } = await import("./pluggy-map");
    expect(brlAmount(tx("x", 10, { amountInAccountCurrency: 54.3, currencyCode: "USD" }))).toBe(54.3);
    expect(brlAmount(tx("y", 10))).toBe(10);
    const out = mapCardTransactions([tx("x", 10, { amountInAccountCurrency: 54.3, currencyCode: "USD" })], card, [], []);
    expect(out.get("2026-10")![0].amount).toBe(5430);
  });

  it("reconhece pagamento da fatura pela categoria e por descrições comuns", async () => {
    const { isCardPayment } = await import("./pluggy-map");
    expect(isCardPayment(tx("a", -900, { category: "Credit card payment", description: "PAGAMENTO" }))).toBe(true);
    expect(isCardPayment(tx("b", -900, { description: "PAG FATURA CARTAO" }))).toBe(true);
    expect(isCardPayment(tx("c", -900, { description: "DEB AUTOM FATURA" }))).toBe(true);
    expect(isCardPayment(tx("d", 50, { description: "PAG*JOSEDASILVA" }))).toBe(false);
    expect(isCardPayment(tx("e", 50, { description: "IFOOD *RESTAURANTE" }))).toBe(false);
  });
});

describe("parcelas sem fatura vinculada", () => {
  it("joga a parcela N para N-1 meses depois da compra", () => {
    const out = mapCardTransactions(
      [tx("p", 100, { date: "2026-03-10T00:00:00Z", creditCardMetadata: { installmentNumber: 8, totalInstallments: 10 } })],
      card,
      [],
      [],
    );
    expect([...out.keys()]).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(out.get("2026-12")![0]).toMatchObject({ installment: { current: 10, total: 10 }, tags: ["Prevista"] });
  });
});

describe("reconcile", () => {
  it("corrige valor, mantém edições, remove o que sumiu e ignora o que não é do banco", async () => {
    const { reconcile } = await import("./pluggy-map");
    const [a, b] = mapCardTransactions([tx("a", 10), tx("b", 20)], card, [], []).get("2026-10")!;
    const manual: Transaction = { ...a, id: "m1", externalId: undefined, source: "manual" };
    const existing: Transaction[] = [{ ...a, amount: 999, split: { type: "INDIVIDUAL_B" }, category: "pets" }, b, manual];
    const incoming = mapCardTransactions([tx("a", 10), tx("c", 30)], card, [], []).get("2026-10")!;
    const r = reconcile(existing, incoming, new Set([card.id]));
    expect(r).toMatchObject({ added: 1, updated: 1, removed: 1 });
    const fixedA = r.merged.find((t) => t.externalId === "pluggy:a")!;
    expect(fixedA).toMatchObject({ amount: 1000, split: { type: "INDIVIDUAL_B" }, category: "pets" });
    expect(r.merged.some((t) => t.externalId === "pluggy:b")).toBe(false);
    expect(r.merged.some((t) => t.id === "m1")).toBe(true);
  });

  it("não remove compras de um cartão que não sincronizou", async () => {
    const { reconcile } = await import("./pluggy-map");
    const existing = mapCardTransactions([tx("a", 10)], card, [], []).get("2026-10")!;
    const r = reconcile(existing, [], new Set());
    expect(r.removed).toBe(0);
    expect(r.merged).toHaveLength(1);
  });
});

describe("cartões virtuais", () => {
  it("separa as compras pelo final do cartão informado", async () => {
    const { cardResolver } = await import("./pluggy-map");
    const r = cardResolver({ id: "acc12345xyz", type: "CREDIT", number: "1234", name: "Santander" }, "USER_A", [card]);
    const out = mapCardTransactions(
      [tx("f", 10, { creditCardMetadata: { cardNumber: "1234" } }), tx("v", 20, { creditCardMetadata: { cardNumber: "**** 9876" } }), tx("n", 30)],
      r.forTx,
      [],
      [],
    );
    const list = out.get("2026-10")!;
    expect(list.find((t) => t.externalId === "pluggy:f")!.cardId).toBe("card-1");
    expect(list.find((t) => t.externalId === "pluggy:n")!.cardId).toBe("card-1");
    expect(list.find((t) => t.externalId === "pluggy:v")!.cardId).toBe("card-pluggy-acc12345-9876");
    expect(r.created.map((c) => [c.last4, c.nickname])).toEqual([["9876", "Santander virtual"]]);
  });
});

describe("faturas futuras", () => {
  const bills = [
    { id: "b9", dueDate: "2026-09-10" },
    { id: "b10", dueDate: "2026-10-10" },
  ];
  it("respeita a fatura do banco e prevê as parcelas que faltam a partir da fatura aberta", () => {
    const parc = (n: number, billId?: string) =>
      tx(`tv${n}`, 300, {
        description: "TV LOJA",
        date: "2026-08-20T00:00:00Z",
        creditCardMetadata: { installmentNumber: n, totalInstallments: 6, billId },
      });
    // Parcelas 2 e 3 antecipadas na mesma fatura; a 4 já está na fatura aberta (pendente).
    const out = mapCardTransactions([parc(1, "b9"), parc(2, "b10"), parc(3, "b10"), parc(4)], card, bills, []);
    const sum = (m: string) => (out.get(m) ?? []).reduce((s, t) => s + t.amount, 0);
    expect(sum("2026-09")).toBe(30000);
    expect(sum("2026-10")).toBe(60000);
    expect(out.get("2026-11")!.map((t) => t.externalId)).toEqual(["pluggy:tv4"]);
    expect(out.get("2026-12")!.map((t) => t.externalId)).toEqual(["pluggy:tv4:p5"]);
    expect(out.get("2027-01")!.map((t) => t.externalId)).toEqual(["pluggy:tv4:p6"]);
  });
  it("não prevê parcelas de compra que sumiu da fatura aberta (terminou ou foi antecipada)", () => {
    const out = mapCardTransactions(
      [tx("x", 50, { description: "LOJA X", creditCardMetadata: { installmentNumber: 2, totalInstallments: 5, billId: "b10" } })],
      card,
      bills,
      [],
    );
    expect([...out.keys()]).toEqual(["2026-10"]);
  });
  it("banco que só lança parcelas no fechamento (XP): prevê a partir da última fatura fechada", () => {
    const out = mapCardTransactions(
      [
        tx("p", 100, { description: "LOJA P", creditCardMetadata: { installmentNumber: 2, totalInstallments: 4, billId: "b10" } }),
        tx("q", 20, { description: "MERCADO", date: "2026-10-25T00:00:00Z" }),
      ],
      card,
      bills,
      [],
    );
    const sum = (m: string) => (out.get(m) ?? []).reduce((s, t) => s + t.amount, 0);
    expect(sum("2026-11")).toBe(12000);
    expect(sum("2026-12")).toBe(10000);
    expect(out.has("2027-01")).toBe(false);
  });
  it("banco que já informa as parcelas futuras (Nubank): usa o mês previsto e não duplica", () => {
    const fut = (n: number, forecast: string) =>
      tx(`f${n}`, 50, {
        description: "LOJA F",
        status: "PENDING",
        date: `${forecast}-01T00:00:00Z`,
        creditCardMetadata: { installmentNumber: n, totalInstallments: 4, billForecastDate: forecast },
      });
    const out = mapCardTransactions(
      [
        tx("f2", 50, { description: "LOJA F", creditCardMetadata: { installmentNumber: 2, totalInstallments: 4, billId: "b10" } }),
        fut(3, "2026-11"),
        fut(4, "2026-12"),
      ],
      card,
      bills,
      [],
    );
    expect(out.get("2026-11")!.map((t) => t.externalId)).toEqual(["pluggy:f3"]);
    expect(out.get("2026-12")!.map((t) => t.externalId)).toEqual(["pluggy:f4"]);
    expect(out.has("2027-01")).toBe(false);
  });
  it("ignora pendente antigo que já está numa fatura fechada", () => {
    const out = mapCardTransactions(
      [
        tx("a", 10, { creditCardMetadata: { billId: "b10" } }),
        tx("old", 98.51, { status: "PENDING", date: "2026-09-25T00:00:00Z", creditCardMetadata: { billForecastDate: "2026-10" } }),
      ],
      card,
      [{ id: "b10", dueDate: "2026-10-10", billClosingDate: "2026-10-01" }],
      [],
    );
    expect([...out.keys()]).toEqual(["2026-10"]);
  });
  it("completa a fatura fechada com o que o banco cobrou e não veio como compra", () => {
    const out = mapCardTransactions(
      [tx("a", 100, { creditCardMetadata: { billId: "b10" } })],
      card,
      [{ id: "b10", dueDate: "2026-10-10", totalAmount: 305 }],
      [],
    );
    const list = out.get("2026-10")!;
    expect(list.reduce((s, t) => s + t.amount, 0)).toBe(30500);
    expect(list.find((t) => t.externalId === "pluggy:ajuste:b10")!.amount).toBe(20500);
  });
  it("ignora lançamento sem fatura válida (0001-01)", () => {
    const out = mapCardTransactions(
      [tx("z", 274.9, { creditCardMetadata: { installmentNumber: 3, totalInstallments: 10, billForecastDate: "0001-01" } })],
      card,
      bills,
      [],
    );
    expect(out.size).toBe(0);
  });
  it("põe compras da fatura aberta no próximo vencimento, pelo dia de fechamento", () => {
    const out = mapCardTransactions(
      [
        tx("a", 10, { date: "2026-08-25T00:00:00Z", creditCardMetadata: { billId: "b9" } }),
        tx("b", 10, { date: "2026-09-25T00:00:00Z", creditCardMetadata: { billId: "b10" } }),
        tx("c", 10, { date: "2026-09-28T00:00:00Z" }),
        tx("d", 10, { date: "2026-10-03T00:00:00Z" }),
      ],
      card,
      bills,
      [],
    );
    expect(out.get("2026-10")?.map((t) => t.id)).toEqual(["plg-b"]);
    expect(out.get("2026-11")?.map((t) => t.id).sort()).toEqual(["plg-c", "plg-d"]);
  });
});

describe("parcelas previstas", () => {
  it("prevê as parcelas de duas compras iguais na mesma loja", () => {
    const p = (id: string, day: string) =>
      tx(id, 100, {
        description: "MAGALU",
        date: `2026-${day}T00:00:00Z`,
        creditCardMetadata: { installmentNumber: 2, totalInstallments: 3, purchaseDate: `2026-${day}T00:00:00Z` },
      });
    const out = mapCardTransactions([p("x", "08-01"), p("y", "08-15")], card, [{ id: "b10", dueDate: "2026-10-10" }], []);
    // Sem fatura vinculada = fatura aberta (novembro); a parcela 3 de cada compra vai para dezembro.
    expect(out.get("2026-12")!.map((t) => t.externalId).sort()).toEqual(["pluggy:x:p3", "pluggy:y:p3"]);
  });
});

describe("billPayments", () => {
  it("marca a fatura como paga, parcial ou em aberto", async () => {
    const { billPayments } = await import("./pluggy-map");
    const bills = [
      { id: "b9", dueDate: "2026-09-10", totalAmount: 1000 },
      { id: "b10", dueDate: "2026-10-10", totalAmount: 800 },
      { id: "b11", dueDate: "2026-11-10", totalAmount: 500 },
    ];
    const pay = (id: string, date: string, v: number) => tx(id, v, { description: "Pagamento de fatura", date: `${date}T00:00:00Z` });
    const r = billPayments(bills, [pay("p1", "2026-09-09", -1000), pay("p2", "2026-10-10", -300)]);
    expect(r.get("b9")!.status).toBe("paga");
    expect(r.get("b10")).toEqual({ paid: 30000, status: "parcial" });
    expect(r.get("b11")!.status).toBe("em aberto");
  });
});

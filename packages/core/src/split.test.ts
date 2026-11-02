import { describe, expect, it } from "vitest";
import {
  allocate,
  billsToExpenses,
  formatBRL,
  parseBRL,
  recurringToExpenses,
  settle,
  shareWeights,
  SplitError,
  type CardBill,
  type CreditCard,
  type Expense,
  type Person,
} from "./index";

const bruno: Person = { id: "bruno", name: "Bruno", monthlyIncome: 700_000 };
const esposa: Person = { id: "esposa", name: "Esposa", monthlyIncome: 500_000 };
const casal = [bruno, esposa];

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe("shareWeights", () => {
  it("meio a meio", () => {
    expect(Object.fromEntries(shareWeights({ kind: "equal" }, casal))).toEqual({
      bruno: 5000,
      esposa: 5000,
    });
  });

  it("proporcional à renda (7k x 5k => 58,33% x 41,67%)", () => {
    const w = shareWeights({ kind: "proportional_income" }, casal);
    expect(Object.fromEntries(w)).toEqual({ bruno: 5833, esposa: 4167 });
    expect(sum(w)).toBe(10_000);
  });

  it("exige renda cadastrada para proporcional", () => {
    expect(() =>
      shareWeights({ kind: "proportional_income" }, [bruno, { id: "x", name: "X" }]),
    ).toThrow(SplitError);
  });

  it("valida percentuais customizados", () => {
    expect(() =>
      shareWeights({ kind: "custom", sharesBps: { bruno: 6000, esposa: 3000 } }, casal),
    ).toThrow(/somam 90%/);
    expect(() =>
      shareWeights({ kind: "custom", sharesBps: { bruno: 10000, intruso: 0 } }, casal),
    ).toThrow(SplitError);
  });
});

describe("allocate", () => {
  it("não perde nem cria centavos", () => {
    const w = shareWeights({ kind: "equal" }, [bruno, esposa, { id: "c", name: "C" }]);
    const parts = allocate(100, w);
    expect(sum(parts)).toBe(100);
    expect([...parts.values()].sort()).toEqual([33, 33, 34]);
  });

  it("divide estornos com sinal negativo", () => {
    const parts = allocate(-1001, shareWeights({ kind: "equal" }, casal));
    expect(sum(parts)).toBe(-1001);
  });

  it("rejeita valores fracionados", () => {
    expect(() => allocate(10.5, shareWeights({ kind: "equal" }, casal))).toThrow(TypeError);
  });
});

describe("settle", () => {
  it("calcula quem deve quanto para quem", () => {
    const expenses: Expense[] = [
      // Bruno pagou o mercado no cartão dele, dividido meio a meio
      {
        id: "1",
        description: "Mercado",
        amount: 40_000,
        paidBy: "bruno",
        allocation: { type: "shared" },
        source: "card_transaction",
      },
      // Esposa pagou um tênis só dela
      {
        id: "2",
        description: "Tênis",
        amount: 30_000,
        paidBy: "esposa",
        allocation: { type: "personal", ownerId: "esposa" },
        source: "card_transaction",
      },
      // Esposa comprou um presente para o Bruno no cartão dela (é do Bruno)
      {
        id: "3",
        description: "Livro do Bruno",
        amount: 10_000,
        paidBy: "esposa",
        allocation: { type: "personal", ownerId: "bruno" },
        source: "card_transaction",
      },
    ];

    const r = settle(casal, expenses, { kind: "equal" });
    expect(r.total).toBe(80_000);
    expect(r.sharedTotal).toBe(40_000);
    expect(r.personalTotal).toBe(40_000);
    // Bruno pagou 400, deve 200 + 100 = 300 => recebe 100
    // Esposa pagou 400, deve 200 + 300 = 500 => paga 100
    expect(r.transfers).toEqual([{ from: "esposa", to: "bruno", amount: 10_000 }]);
    expect(r.balances.reduce((a, b) => a + b.balance, 0)).toBe(0);
  });

  it("usa a regra específica da despesa quando houver", () => {
    const r = settle(
      casal,
      [
        {
          id: "aluguel",
          description: "Aluguel",
          amount: 300_000,
          paidBy: "bruno",
          allocation: { type: "shared", rule: { kind: "proportional_income" } },
          source: "recurring_bill",
        },
      ],
      { kind: "equal" },
    );
    const esposaBal = r.balances.find((b) => b.personId === "esposa")!;
    expect(esposaBal.owes).toBe(125_010); // 41,67% de 3.000
    expect(r.transfers).toEqual([{ from: "esposa", to: "bruno", amount: 125_010 }]);
  });

  it("sem despesas não há transferências", () => {
    expect(settle(casal, [], { kind: "equal" }).transfers).toEqual([]);
  });

  it("rejeita pagador desconhecido", () => {
    expect(() =>
      settle(
        casal,
        [
          {
            id: "x",
            description: "?",
            amount: 1,
            paidBy: "intruso",
            allocation: { type: "shared" },
            source: "manual",
          },
        ],
        { kind: "equal" },
      ),
    ).toThrow(SplitError);
  });
});

describe("integração faturas + recorrentes", () => {
  it("monta o fechamento a partir das faturas classificadas", () => {
    const cards: CreditCard[] = [
      { id: "c1", ownerId: "bruno", institution: "Banco A", displayName: "Cartão A" },
      { id: "c2", ownerId: "esposa", institution: "Banco B", displayName: "Cartão B" },
    ];
    const bills: CardBill[] = [
      {
        id: "b1",
        cardId: "c1",
        referenceMonth: "2026-10",
        dueDate: "2026-11-10",
        total: 25_000,
        transactions: [
          { id: "t1", cardId: "c1", date: "2026-10-03", description: "Farmácia", amount: 5_000 },
          { id: "t2", cardId: "c1", date: "2026-10-05", description: "Restaurante", amount: 20_000 },
        ],
      },
      {
        id: "b2",
        cardId: "c2",
        referenceMonth: "2026-10",
        dueDate: "2026-11-15",
        total: 10_000,
        transactions: [
          { id: "t3", cardId: "c2", date: "2026-10-08", description: "Padaria", amount: 10_000 },
        ],
      },
    ];
    const expenses = [
      ...billsToExpenses(bills, cards, { t2: { type: "shared" }, t3: { type: "shared" } }),
      ...recurringToExpenses([
        {
          id: "r1",
          description: "Internet",
          amount: 10_000,
          paidBy: "esposa",
          allocation: { type: "shared" },
          dueDay: 10,
          active: true,
        },
        {
          id: "r2",
          description: "Academia (cancelada)",
          amount: 99_999,
          paidBy: "bruno",
          allocation: { type: "shared" },
          dueDay: 5,
          active: false,
        },
      ]),
    ];

    const r = settle(casal, expenses, { kind: "equal" });
    expect(r.total).toBe(45_000);
    expect(r.sharedTotal).toBe(40_000); // 200 + 100 + 100
    // Bruno pagou 250, deve 50 (farmácia) + 200 => 0
    expect(r.transfers).toEqual([]);
  });
});

describe("money", () => {
  it("formata e interpreta reais", () => {
    expect(formatBRL(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(parseBRL("1.234,56")).toBe(123456);
    expect(parseBRL("R$ 10")).toBe(1000);
    expect(parseBRL("abc")).toBeNull();
  });
});

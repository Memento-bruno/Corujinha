import {
  billsToExpenses,
  describeShares,
  recurringToExpenses,
  settle,
  type Allocation,
  type CardBill,
  type CreditCard,
  type Person,
  type RecurringBill,
  type SplitRule,
} from "@corujinha/core";
import { ApiError, previousMonth, type Api } from "./api";

/**
 * Modo demonstração: a mesma interface da API, mas rodando inteira no
 * aparelho com dados fictícios. Não fala com servidor, banco nem Pluggy.
 * Ativado com EXPO_PUBLIC_DEMO=1 (e sempre na versão web de teste).
 */
export const DEMO = process.env.EXPO_PUBLIC_DEMO === "1";

export const DEMO_PEOPLE: Person[] = [
  { id: "bruno", name: "Bruno", monthlyIncome: 700_000 },
  { id: "esposa", name: "Esposa", monthlyIncome: 500_000 },
];

interface DemoState {
  people: Person[];
  rule: SplitRule;
  cards: CreditCard[];
  bills: CardBill[];
  classification: Record<string, Allocation>;
  recurring: RecurringBill[];
  extraConnections: number;
}

function dueDate(month: string, day: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(y, m, day); // mês seguinte ao de referência
  return d.toISOString().slice(0, 10);
}

function tx(cardId: string, id: string, month: string, day: number, description: string, amount: number, extra = {}) {
  return { id, cardId, date: `${month}-${String(day).padStart(2, "0")}`, description, amount, ...extra };
}

function seed(): DemoState {
  const month = previousMonth();
  const cards: CreditCard[] = [
    { id: "c-bruno", ownerId: "bruno", institution: "Banco Demo A", displayName: "Cartão Platinum final 1111", last4: "1111" },
    { id: "c-esposa", ownerId: "esposa", institution: "Banco Demo B", displayName: "Cartão Gold final 2222", last4: "2222" },
  ];
  const brunoTx = [
    tx("c-bruno", "b1", month, 2, "Supermercado", 48_320, { category: "Mercado" }),
    tx("c-bruno", "b2", month, 5, "Posto de combustível", 22_000, { category: "Transporte" }),
    tx("c-bruno", "b3", month, 8, "Streaming de vídeo", 5_590, { category: "Assinaturas" }),
    tx("c-bruno", "b4", month, 12, "Restaurante (jantar a dois)", 18_750, { category: "Restaurantes" }),
    tx("c-bruno", "b5", month, 15, "Geladeira", 39_900, { category: "Casa", installment: { number: 3, total: 10 } }),
    tx("c-bruno", "b6", month, 21, "Loja de games", 24_990, { category: "Lazer" }),
    tx("c-bruno", "b7", month, 26, "Estorno farmácia", -3_400, { category: "Saúde" }),
  ];
  const esposaTx = [
    tx("c-esposa", "e1", month, 3, "Hortifruti", 13_480, { category: "Mercado" }),
    tx("c-esposa", "e2", month, 7, "Farmácia", 8_960, { category: "Saúde" }),
    tx("c-esposa", "e3", month, 10, "Roupas", 32_000, { category: "Vestuário" }),
    tx("c-esposa", "e4", month, 14, "Pet shop", 15_700, { category: "Pet" }),
    tx("c-esposa", "e5", month, 19, "Delivery", 7_890, { category: "Restaurantes" }),
    tx("c-esposa", "e6", month, 24, "Presente para o Bruno", 12_000, { category: "Presentes" }),
  ];
  const total = (xs: { amount: number }[]) => xs.reduce((a, b) => a + b.amount, 0);
  const bills: CardBill[] = [
    { id: "bill-bruno", cardId: "c-bruno", referenceMonth: month, dueDate: dueDate(month, 10), total: total(brunoTx), transactions: brunoTx },
    { id: "bill-esposa", cardId: "c-esposa", referenceMonth: month, dueDate: dueDate(month, 15), total: total(esposaTx), transactions: esposaTx },
  ];
  const shared: Allocation = { type: "shared" };
  return {
    people: DEMO_PEOPLE.map((p) => ({ ...p })),
    rule: { kind: "proportional_income" },
    cards,
    bills,
    classification: {
      b1: shared,
      b4: shared,
      b5: shared,
      e1: shared,
      e4: shared,
      e5: shared,
      e6: { type: "personal", ownerId: "bruno" },
    },
    recurring: [
      { id: "r1", description: "Aluguel", amount: 280_000, paidBy: "bruno", allocation: shared, dueDay: 5, active: true },
      { id: "r2", description: "Condomínio", amount: 65_000, paidBy: "esposa", allocation: shared, dueDay: 10, active: true },
      { id: "r3", description: "Internet", amount: 12_990, paidBy: "esposa", allocation: shared, dueDay: 15, active: true },
      { id: "r4", description: "Academia do Bruno", amount: 11_990, paidBy: "bruno", allocation: { type: "personal", ownerId: "bruno" }, dueDay: 8, active: true },
    ],
    extraConnections: 0,
  };
}

let state: DemoState | null = null;
const s = () => (state ??= seed());

/** Volta os dados de exemplo ao estado inicial. */
export function resetDemo() {
  state = seed();
}

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));

export function createDemoApi(userId: string): Api {
  return {
    household: async () => {
      const st = s();
      let shares: Record<string, number> | null = null;
      try {
        shares = describeShares(st.rule, st.people);
      } catch {
        shares = null;
      }
      return wait({ people: st.people.map((p) => ({ ...p })), rule: st.rule, shares });
    },
    setIncome: async (monthlyIncome) => {
      const me = s().people.find((p) => p.id === userId)!;
      me.monthlyIncome = monthlyIncome;
      return wait({ ...me });
    },
    setRule: async (rule) => {
      try {
        describeShares(rule, s().people);
      } catch (e) {
        throw new ApiError(422, { message: e instanceof Error ? e.message : String(e) });
      }
      s().rule = rule;
      return wait({ rule });
    },
    connectToken: async () => wait({ accessToken: "demo" }),
    sync: async () => {
      // Simula a conexão de mais um cartão de quem está logado.
      const st = s();
      const n = ++st.extraConnections;
      const month = previousMonth();
      const cardId = `c-${userId}-extra-${n}`;
      const txs = [
        tx(cardId, `${cardId}-1`, month, 4, "Padaria", 4_250, { category: "Mercado" }),
        tx(cardId, `${cardId}-2`, month, 11, "Uber", 3_180, { category: "Transporte" }),
        tx(cardId, `${cardId}-3`, month, 18, "Livraria", 8_990, { category: "Lazer" }),
      ];
      st.cards.push({
        id: cardId,
        ownerId: userId,
        institution: `Banco Demo ${String.fromCharCode(66 + n)}`,
        displayName: `Cartão extra final ${3000 + n}`,
        last4: String(3000 + n),
      });
      st.bills.push({
        id: `bill-${cardId}`,
        cardId,
        referenceMonth: month,
        dueDate: dueDate(month, 20),
        total: txs.reduce((a, b) => a + b.amount, 0),
        transactions: txs,
      });
      return wait({ cards: 1, bills: 1, consentRevoked: true });
    },
    bills: async (month) => {
      const st = s();
      return wait({
        cards: [...st.cards],
        bills: st.bills.filter((b) => b.referenceMonth === month),
        classification: { ...st.classification },
      });
    },
    classify: async (txId, allocation) => {
      s().classification[txId] = allocation;
      return wait(undefined);
    },
    recurring: async () => wait({ items: [...s().recurring] }),
    addRecurring: async (bill) => {
      const full = { ...bill, id: `r-${Date.now()}` };
      s().recurring.push(full);
      return wait(full);
    },
    deleteRecurring: async (id) => {
      s().recurring = s().recurring.filter((r) => r.id !== id);
      return wait(undefined);
    },
    settlement: async (month) => {
      const st = s();
      const expenses = [
        ...billsToExpenses(
          st.bills.filter((b) => b.referenceMonth === month),
          st.cards,
          st.classification,
        ),
        ...recurringToExpenses(st.recurring),
      ];
      try {
        return wait({ month, ...settle(st.people, expenses, st.rule) });
      } catch (e) {
        throw new ApiError(422, { message: e instanceof Error ? e.message : String(e) });
      }
    },
  };
}

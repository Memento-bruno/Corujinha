import { describe, expect, it } from "vitest";
import { demoConfig } from "../demo/seed";
import type { RecurringDebt, StatementFile, Transaction } from "../domain/types";
import { monthCsv } from "../client/export-csv";
import { committedIn, endingInstallments, freedByMonth } from "./installments";
import { shouldReview } from "./merchants";
import { dueReminders, reminderEmail } from "./reminders";
import { RuleBasedSavingsEngine, feeTypeOf } from "./savings";

const cfg = { ...demoConfig(), monthlyGoal: 100_000 };
const card = cfg.cards[0];
let n = 0;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: `t${++n}`,
  date: "2026-10-05",
  description: "Compra",
  merchantKey: "compra",
  amount: 1000,
  cardId: card.id,
  paidBy: card.owner,
  category: "compras",
  tags: [],
  split: { type: "SHARED_DEFAULT" },
  source: "pluggy",
  ...p,
});

describe("tarifas evitáveis", () => {
  it("reconhece anuidade, juros, IOF, multa, seguro e saque", () => {
    expect(feeTypeOf("ANUIDADE DIFERENCIADA 03/12")).toBe("anuidade");
    expect(feeTypeOf("Juros de rotativo")).toBe("juros");
    expect(feeTypeOf("IOF COMPRA INTERNACIONAL")).toBe("iof");
    expect(feeTypeOf("Multa por atraso")).toBe("multa");
    expect(feeTypeOf("Seguro Cartão Protegido")).toBe("seguro");
    expect(feeTypeOf("Saque crédito")).toBe("saque");
    expect(feeTypeOf("Mercado Pão de Açúcar")).toBeNull();
    expect(feeTypeOf("Mora do Sol Restaurante")).toBeNull();
  });

  it("vira um alerta com a soma das tarifas", () => {
    const month = "2026-10";
    const txs = [tx({ description: "Anuidade", amount: 4000 }), tx({ description: "IOF", amount: 350 }), tx({ description: "Padaria" })];
    const recs = new RuleBasedSavingsEngine({ month, byMonth: { [month]: txs }, config: cfg }).bankFees();
    expect(recs).toHaveLength(1);
    expect(recs[0].monthlySavings).toBe(4350);
    expect(recs[0].details.kind).toBe("fees");
  });
});

describe("parcelas", () => {
  const month = "2026-10";
  const txs = [
    tx({ description: "Geladeira", amount: 30_000, installment: { current: 8, total: 10 } }),
    tx({ description: "Celular", amount: 20_000, installment: { current: 1, total: 4 } }),
    tx({ description: "Avulsa", amount: 5_000 }),
  ];

  it("diz quando cada parcelamento termina", () => {
    const list = endingInstallments(txs, month);
    expect(list.map((x) => [x.description, x.lastMonth])).toEqual([
      ["Geladeira", "2026-12"],
      ["Celular", "2027-01"],
    ]);
  });

  it("mostra quanto sobra a mais em cada mês", () => {
    const freed = freedByMonth(txs, month, 4);
    expect(freed.map((m) => m.freed)).toEqual([0, 0, 30_000, 50_000]);
    expect(freed[2].ending.map((x) => x.description)).toEqual(["Geladeira"]);
  });

  it("avisa quando as parcelas do mês que vem passam de 30% da meta", () => {
    expect(committedIn(txs, month, "2026-11")).toBe(50_000);
    const recs = new RuleBasedSavingsEngine({ month, byMonth: { [month]: txs }, config: cfg }).futureInstallments();
    expect(recs).toHaveLength(1);
    expect(recs[0].severity).toBe("high");
    const det = recs[0].details;
    expect(det.kind === "commitment" && det.relief).toBe("2027-01");
  });

  it("não avisa quando está abaixo do limite", () => {
    const small = [tx({ amount: 10_000, installment: { current: 1, total: 3 } })];
    expect(new RuleBasedSavingsEngine({ month, byMonth: { [month]: small }, config: cfg }).futureInstallments()).toEqual([]);
  });
});

describe("compras para conferir", () => {
  const today = new Date("2026-10-20T12:00:00Z");
  it("pede conferência de compra nova de fornecedor desconhecido", () => {
    expect(shouldReview({}, tx({ date: "2026-10-18" }), today)).toBe(true);
  });
  it("não pede quando o app já conhece o fornecedor, é parcela antiga, estorno ou compra velha", () => {
    const rules = { compra: { name: "Compra", category: "mercado" as const, updatedAt: "" } };
    expect(shouldReview(rules, tx({ date: "2026-10-18" }), today)).toBe(false);
    expect(shouldReview({}, tx({ date: "2026-10-18", installment: { current: 2, total: 5 } }), today)).toBe(false);
    expect(shouldReview({}, tx({ date: "2026-10-18", amount: -500 }), today)).toBe(false);
    expect(shouldReview({}, tx({ date: "2026-08-01" }), today)).toBe(false);
  });
});

describe("lembretes de vencimento", () => {
  const debt = (p: Partial<RecurringDebt>): RecurringDebt => ({
    id: "d1",
    description: "Internet",
    kind: "CONTA_FIXA",
    amount: 12_000,
    paidBy: "USER_B",
    split: { type: "SHARED_DEFAULT" },
    category: "servicos",
    dueDay: 10,
    startMonth: "2026-01",
    active: true,
    ...p,
  });
  const statement = (month: string, bankBills: StatementFile["bankBills"]): StatementFile => ({ schemaVersion: 1, month, transactions: [], bankBills, updatedAt: "" });

  it("avisa 3 dias antes e no dia, para quem paga", () => {
    const r = dueReminders("2026-11-07", [debt({})], {}, cfg);
    expect(r.USER_B).toEqual([{ title: "Internet", date: "2026-11-10", daysLeft: 3 }]);
    expect(r.USER_A).toEqual([]);
    expect(dueReminders("2026-11-10", [debt({})], {}, cfg).USER_B[0].daysLeft).toBe(0);
    expect(dueReminders("2026-11-08", [debt({})], {}, cfg).USER_B).toEqual([]);
  });

  it("não avisa o que já foi marcado como pago", () => {
    expect(dueReminders("2026-11-07", [debt({ paidMonths: ["2026-11"] })], {}, cfg).USER_B).toEqual([]);
  });

  it("avisa da fatura do cartão pelo vencimento do banco e passa de um mês para o outro", () => {
    const st = { "2026-12": statement("2026-12", { [card.id]: { total: 50_000, paid: 0, status: "em aberto", dueDate: "2026-12-02" } }) };
    const r = dueReminders("2026-11-29", [], st, cfg);
    expect(r[card.owner]).toEqual([{ title: `Fatura ${card.nickname}`, date: "2026-12-02", daysLeft: 3 }]);
    const paid = { ...cfg, paidCardBills: [`${card.id}|2026-12`] };
    expect(dueReminders("2026-11-29", [], st, paid)[card.owner]).toEqual([]);
  });

  it("o e-mail não mostra valores", () => {
    const m = reminderEmail("Patricia", [{ title: "Internet", date: "2026-11-10", daysLeft: 3 }], "https://app");
    expect(m.subject).toContain("Internet");
    expect(m.text).not.toMatch(/R\$|120/);
  });
});

describe("planilha do mês", () => {
  it("tem cabeçalho, compras e contas, com vírgula decimal", () => {
    const csv = monthCsv("2026-10", [tx({ description: "Mercado; filial", amount: 12_345 })], [], cfg);
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(lines[0]).toContain("Descrição;Origem");
    expect(lines[1]).toContain('"Mercado; filial"');
    expect(lines[1]).toContain("123,45");
  });
});

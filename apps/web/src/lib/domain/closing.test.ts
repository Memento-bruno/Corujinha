import { describe, expect, it } from "vitest";
import { debtsAfterClosing, isLockedTx, keepLockedTxs } from "./closing";
import type { ClosingCutoff, RecurringDebt, Transaction } from "./types";

const C: ClosingCutoff = { date: "2026-11-03", closedAt: "x", closedBy: "USER_A" };
const tx = (id: string, date: string, extra: Partial<Transaction> = {}): Transaction => ({
  id, date, description: id, merchantKey: id, amount: 100, cardId: "c", paidBy: "USER_A", category: "outros", tags: [], split: { type: "INDIVIDUAL_A" }, source: "manual", ...extra,
});
const debt = (extra: Partial<RecurringDebt>): RecurringDebt => ({
  id: "d", description: "Luz", kind: "BOLETO", amount: 1000, paidBy: "USER_A", split: { type: "SHARED_DEFAULT" }, category: "moradia", dueDay: 10, startMonth: "2026-01", active: true, ...extra,
});

describe("fechamento por data", () => {
  it("trava compras até a data (inclusive)", () => {
    expect(isLockedTx(tx("a", "2026-11-03"), "2026-12", C)).toBe(true);
    expect(isLockedTx(tx("b", "2026-11-04"), "2026-12", C)).toBe(false);
    expect(isLockedTx(tx("c", "2026-11-03"), "2026-12", undefined)).toBe(false);
  });

  it("parcela de compra antiga numa fatura depois do mês da data continua contando", () => {
    const p = tx("p", "2026-06-10", { installment: { current: 6, total: 10 } });
    expect(isLockedTx(p, "2026-11", C)).toBe(true);
    expect(isLockedTx(p, "2026-12", C)).toBe(false);
  });

  it("contas fora do cartão: só as que vencem depois da data", () => {
    const [luz] = debtsAfterClosing([debt({ dueDay: 10 })], C);
    expect(luz.startMonth).toBe("2026-11"); // vence dia 10/11, depois do dia 03
    const [agua] = debtsAfterClosing([debt({ dueDay: 2 })], C);
    expect(agua.startMonth).toBe("2026-12"); // vence dia 02/11: ficou no fechamento
    const [fin] = debtsAfterClosing([debt({ dueDay: 2, startMonth: "2026-09", totalInstallments: 5 })], C);
    expect(fin).toMatchObject({ startMonth: "2026-12", totalInstallments: 2 }); // jan/27 é a última
    const [acabou] = debtsAfterClosing([debt({ startMonth: "2026-01", totalInstallments: 3 })], C);
    expect(acabou.active).toBe(false);
  });

  it("o que o cliente mandar não muda nem apaga compra fechada", () => {
    const stored = [tx("velha", "2026-11-01"), tx("nova", "2026-11-05")];
    const sent = [{ ...stored[0], description: "mudou" }, { ...stored[1], description: "ok" }, tx("outra", "2026-11-06")];
    const out = keepLockedTxs(stored, sent, "2026-11", C);
    expect(out.find((t) => t.id === "velha")!.description).toBe("velha");
    expect(out.find((t) => t.id === "nova")!.description).toBe("ok");
    expect(keepLockedTxs(stored, [], "2026-11", C).map((t) => t.id)).toEqual(["velha"]);
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addMonths, monthOf } from "../domain/months";
import { defaultConfig } from "../demo/seed";
import { DriveDatabaseService } from "../server/database";
import { LocalBlobStore } from "../server/local-store";

const thisMonth = monthOf(new Date());
const lastMonth = addMonths(thisMonth, -1);

vi.mock("./pluggy-client", () => ({
  getCreditAccounts: vi.fn(async () => [{ id: "acc-0001-aaaa", type: "CREDIT", number: "**** 4321", name: "Cartão Roxo", creditData: { brand: "VISA" } }]),
  getBills: vi.fn(async () => []),
  getTransactions: vi.fn(async () => [
    { id: "t1", description: "IFOOD *RESTAURANTE", amount: -45.9, date: `${thisMonth}-03T10:00:00Z` },
    { id: "t2", description: "UBER *TRIP", amount: -18.2, date: `${lastMonth}-20T10:00:00Z` },
    { id: "t3", description: "Pagamento recebido", amount: 1500, date: `${lastMonth}-25T10:00:00Z` },
  ]),
}));

const ITEM = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
let dir: string;
let db: DriveDatabaseService;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "corujinha-sync-"));
  db = new DriveDatabaseService(new LocalBlobStore(dir), undefined);
  const cfg = defaultConfig();
  await db.saveConfig({ ...cfg, pluggyItems: [{ itemId: ITEM, owner: "USER_B" }] }, null);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("syncPluggy", () => {
  it("cria o cartão, grava por mês e não duplica na segunda vez", async () => {
    const { syncPluggy } = await import("./pluggy-sync");
    const first = await syncPluggy(db, 3);
    expect(first.errors).toEqual([]);
    expect(first.added).toBe(2);
    expect(first.newCards).toEqual(["Cartão Roxo •4321"]);

    const cfg = (await db.getConfig()).data;
    const card = cfg.cards.find((c) => c.last4 === "4321")!;
    expect(card).toMatchObject({ owner: "USER_B", brand: "visa" });
    expect(cfg.pluggyLastSyncAt).toBeTruthy();

    const cur = (await db.getStatement(thisMonth)).data.transactions;
    expect(cur).toHaveLength(1);
    expect(cur[0]).toMatchObject({ amount: 4590, cardId: card.id, paidBy: "USER_B" });

    const second = await syncPluggy(db, 3);
    expect(second.added).toBe(0);
    expect(second.newCards).toEqual([]);
  });

  it("não mexe em mês fechado", async () => {
    const s = await db.getStatement(lastMonth);
    await db.saveStatement({ ...s.data, snapshot: { closedAt: "x", closedBy: "USER_A" } as never }, s.etag);
    const { syncPluggy } = await import("./pluggy-sync");
    const r = await syncPluggy(db, 3);
    expect(r.skippedClosedMonths).toEqual([lastMonth]);
    expect((await db.getStatement(lastMonth)).data.transactions).toHaveLength(0);
  });
});

describe("clearPluggyTransactions", () => {
  it("apaga só as compras do banco", async () => {
    const { syncPluggy, clearPluggyTransactions } = await import("./pluggy-sync");
    await syncPluggy(db, 3);
    const s = await db.getStatement(thisMonth);
    const manual = { ...s.data.transactions[0], id: "manual-1", externalId: undefined, source: "manual" as const };
    await db.saveStatement({ ...s.data, transactions: [...s.data.transactions, manual] }, s.etag);
    const r = await clearPluggyTransactions(db);
    expect(r.removed).toBe(2);
    expect((await db.getStatement(thisMonth)).data.transactions.map((t) => t.id)).toEqual(["manual-1"]);
  });
});

describe("disconnectPluggyItem", () => {
  it("tira a conexão, as compras dela e o cartão criado por ela", async () => {
    const { syncPluggy, disconnectPluggyItem } = await import("./pluggy-sync");
    await syncPluggy(db, 3);
    expect((await db.getStatement(thisMonth)).data.transactions[0].pluggyItemId).toBe(ITEM);
    const r = await disconnectPluggyItem(db, ITEM);
    expect(r.removed).toBe(2);
    expect(r.removedCards).toBe(1);
    const cfg = (await db.getConfig()).data;
    expect(cfg.pluggyItems).toEqual([]);
    expect(cfg.cards.some((c) => c.last4 === "4321")).toBe(false);
    expect((await db.getStatement(thisMonth)).data.transactions).toEqual([]);
  });
});

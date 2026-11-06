import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { decryptJson, encryptJson, encryptJsonV1ForTests } from "./crypto";
import { LocalBlobStore } from "./local-store";
import { ConflictError } from "./blob-store";
import { DriveDatabaseService } from "./database";

const SECRET = "x".repeat(44);

describe("AES-256-GCM", () => {
  it("criptografa e descriptografa", () => {
    const enc = encryptJson({ a: 1 }, SECRET, "f.json");
    expect(enc).not.toContain('"a"');
    expect(decryptJson(enc, SECRET, "f.json")).toEqual({ a: 1 });
  });
  it("falha com segredo errado ou arquivo trocado (AAD)", () => {
    const enc = encryptJson({ a: 1 }, SECRET, "f.json");
    expect(() => decryptJson(enc, "y".repeat(44), "f.json")).toThrow();
    expect(() => decryptJson(enc, SECRET, "g.json")).toThrow();
  });
  it("continua lendo arquivos no formato antigo (v1)", () => {
    const old = encryptJsonV1ForTests({ b: 2 }, SECRET, "f.json");
    expect(JSON.parse(old).v).toBe(1);
    expect(decryptJson(old, SECRET, "f.json")).toEqual({ b: 2 });
    expect(JSON.parse(encryptJson({}, SECRET, "f.json")).v).toBe(2);
  });
  it("no Drive recusa arquivo sem criptografia", () => {
    expect(decryptJson('{"a":1}', SECRET, "f.json")).toEqual({ a: 1 });
    expect(() => decryptJson('{"a":1}', SECRET, "f.json", true)).toThrow(/criptografado/);
  });
  it("é rápido: muitos arquivos não pagam o scrypt de novo", () => {
    encryptJson({}, SECRET, "aquece.json");
    const t = performance.now();
    for (let i = 0; i < 20; i++) decryptJson(encryptJson({ i }, SECRET, `s-${i}.json`), SECRET, `s-${i}.json`);
    expect(performance.now() - t).toBeLessThan(500);
  });
  it("exige segredo forte", () => {
    expect(() => encryptJson({}, "curto", "f.json")).toThrow(/32/);
  });
});

describe("controle de concorrência (ETag)", () => {
  it("recusa gravação com ETag desatualizado", async () => {
    const store = new LocalBlobStore(mkdtempSync(path.join(tmpdir(), "coruja-")));
    const db = new DriveDatabaseService(store, SECRET);
    const first = await db.getRecurring();
    expect(first.etag).toBeNull();
    const saved = await db.saveRecurring(first.data, null);
    await db.saveRecurring(saved.data, saved.etag); // ok
    await expect(db.saveRecurring(saved.data, saved.etag)).rejects.toBeInstanceOf(ConflictError);
    await expect(db.saveRecurring(saved.data, null)).rejects.toBeInstanceOf(ConflictError);
  });

  it("drive exige ENCRYPTION_SECRET", () => {
    const fake = { kind: "drive" } as never;
    expect(() => new DriveDatabaseService(fake, undefined)).toThrow(/ENCRYPTION_SECRET/);
  });

  it("seed da demo cria 6 faturas", async () => {
    const store = new LocalBlobStore(mkdtempSync(path.join(tmpdir(), "coruja-")));
    const db = new DriveDatabaseService(store, undefined);
    await db.seedDemo();
    expect(await db.listStatementMonths()).toHaveLength(6);
  });
});

describe("cópias de segurança", () => {
  it("guarda tudo, restaura e faz cópia antes de restaurar", async () => {
    const store = new LocalBlobStore(mkdtempSync(path.join(tmpdir(), "coruja-")));
    const db = new DriveDatabaseService(store, SECRET);
    const st = await db.getStatement("2026-10");
    const tx = { id: "t1", date: "2026-10-01", description: "Mercado", merchantKey: "mercado", amount: 1000, cardId: "c", paidBy: "USER_A" as const, category: "mercado" as never, tags: [], split: { type: "SHARED_DEFAULT" as const }, source: "manual" as const };
    const saved = await db.saveStatement({ ...st.data, transactions: [tx] }, st.etag);
    const b = await db.backup("antes-de-apagar-compras-do-banco");
    expect(b.reason).toBe("antes-de-apagar-compras-do-banco");
    await db.saveStatement({ ...saved.data, transactions: [] }, saved.etag);
    expect((await db.getStatement("2026-10")).data.transactions).toHaveLength(0);

    const r = await db.restoreBackup(b.name);
    expect(r.files).toBeGreaterThanOrEqual(1);
    expect((await db.getStatement("2026-10")).data.transactions.map((t) => t.id)).toEqual(["t1"]);
    const list = await db.listBackups();
    expect(list.map((x) => x.reason)).toContain("antes-de-restaurar");
    // A cópia não aparece como mês de fatura.
    expect(await db.listStatementMonths()).toEqual(["2026-10"]);
  });

  it("recusa nome de cópia inválido", async () => {
    const db = new DriveDatabaseService(new LocalBlobStore(mkdtempSync(path.join(tmpdir(), "coruja-"))), SECRET);
    await expect(db.restoreBackup("../household-config.json")).rejects.toThrow(/inválida/);
  });
});

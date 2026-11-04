import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { decryptJson, encryptJson } from "./crypto";
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

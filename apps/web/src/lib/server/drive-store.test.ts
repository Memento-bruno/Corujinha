import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { drive_v3 } from "googleapis";
import { ConflictError } from "./blob-store";
import { DriveBlobStore } from "./drive-store";

const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");

interface FakeFile {
  id: string;
  name: string;
  createdTime: number;
  trashed: boolean;
  revisions: { id: string; content: string }[];
}

async function bodyText(body: unknown): Promise<string> {
  if (typeof body === "string") return body;
  let out = "";
  for await (const chunk of body as AsyncIterable<unknown>) out += String(chunk);
  return out;
}

/** Drive de mentira, só com o que o DriveBlobStore usa. Os ganchos simulam outro servidor gravando no meio. */
function fakeDrive() {
  const files: FakeFile[] = [];
  let seq = 0;
  const hooks: { beforeUpdate?: () => Promise<void>; beforeCreate?: () => Promise<void> } = {};
  const head = (f: FakeFile) => f.revisions.at(-1)!;
  const meta = (f: FakeFile) => ({ id: f.id, name: f.name, version: String(f.revisions.length), md5Checksum: md5(head(f).content), trashed: f.trashed });
  const addRevision = (f: FakeFile, content: string) => f.revisions.push({ id: `r${++seq}`, content });
  const create = (name: string, content: string) => {
    const f: FakeFile = { id: `f${++seq}`, name, createdTime: seq, trashed: false, revisions: [] };
    addRevision(f, content);
    files.push(f);
    return f;
  };
  const byId = (id: string) => {
    const f = files.find((x) => x.id === id);
    if (!f) throw new Error("not found");
    return f;
  };
  const api = {
    files: {
      list: async ({ q }: { q: string }) => {
        const name = /name = '([^']+)'/.exec(q)?.[1];
        const list = files
          .filter((f) => !f.trashed && (!name || f.name === name))
          .sort((a, b) => a.createdTime - b.createdTime)
          .map(meta);
        return { data: { files: list } };
      },
      get: async ({ fileId, alt }: { fileId: string; alt?: string }) => {
        const f = byId(fileId);
        return { data: alt === "media" ? head(f).content : meta(f) };
      },
      update: async ({ fileId, media, requestBody }: { fileId: string; media?: { body: unknown }; requestBody?: { trashed?: boolean } }) => {
        const f = byId(fileId);
        if (media) {
          const content = await bodyText(media.body);
          const hook = hooks.beforeUpdate;
          hooks.beforeUpdate = undefined;
          if (hook) await hook();
          addRevision(f, content);
        }
        if (requestBody?.trashed) f.trashed = true;
        return { data: meta(f) };
      },
      create: async ({ requestBody, media }: { requestBody: { name: string }; media: { body: unknown } }) => {
        const content = await bodyText(media.body);
        const hook = hooks.beforeCreate;
        hooks.beforeCreate = undefined;
        if (hook) await hook();
        return { data: meta(create(requestBody.name, content)) };
      },
      delete: async () => ({ data: {} }),
    },
    revisions: {
      list: async ({ fileId }: { fileId: string }) => ({
        data: { revisions: byId(fileId).revisions.map((r) => ({ id: r.id, md5Checksum: md5(r.content) })) },
      }),
      get: async ({ fileId, revisionId }: { fileId: string; revisionId: string }) => ({
        data: byId(fileId).revisions.find((r) => r.id === revisionId)!.content,
      }),
    },
  };
  return { drive: api as unknown as drive_v3.Drive, files, hooks, create, addRevision };
}

describe("DriveBlobStore (vários servidores ao mesmo tempo)", () => {
  it("grava, lê e recusa ETag velho", async () => {
    const fake = fakeDrive();
    const store = new DriveBlobStore("pasta", fake.drive);
    const a = await store.write("x.json", "um", null);
    expect((await store.read("x.json"))?.content).toBe("um");
    await store.write("x.json", "dois", a.etag);
    await expect(store.write("x.json", "tres", a.etag)).rejects.toBeInstanceOf(ConflictError);
  });

  it("gravação de outro servidor no meio: devolve a dela e responde conflito", async () => {
    const fake = fakeDrive();
    const store = new DriveBlobStore("pasta", fake.drive);
    const first = await store.write("x.json", "original", null);
    // Outro servidor grava "do outro" entre a nossa conferência e a nossa gravação.
    fake.hooks.beforeUpdate = async () => void fake.addRevision(fake.files[0], "do outro");
    await expect(store.write("x.json", "meu", first.etag)).rejects.toBeInstanceOf(ConflictError);
    const now = await new DriveBlobStore("pasta", fake.drive).read("x.json");
    expect(now?.content).toBe("do outro");
  });

  it("histórico do Drive atrasado (toques seguidos): não desfaz a gravação anterior", async () => {
    const fake = fakeDrive();
    const store = new DriveBlobStore("pasta", fake.drive);
    await store.write("x.json", "zero", null);
    const um = await store.write("x.json", "um", (await store.read("x.json"))!.etag);
    // O histórico ainda não mostra a versão "um" quando a próxima gravação confere.
    fake.hooks.beforeUpdate = async () => {
      const f = fake.files[0];
      f.revisions = f.revisions.filter((r) => r.content !== "um");
    };
    await store.write("x.json", "dois", um.etag);
    fake.hooks.beforeUpdate = undefined;
    expect((await new DriveBlobStore("pasta", fake.drive).read("x.json"))?.content).toBe("dois");
  });

  it("dois servidores criando o mesmo arquivo: fica o mais antigo", async () => {
    const fake = fakeDrive();
    const store = new DriveBlobStore("pasta", fake.drive);
    fake.hooks.beforeCreate = async () => void fake.create("x.json", "do outro");
    await expect(store.write("x.json", "meu", null)).rejects.toBeInstanceOf(ConflictError);
    expect(fake.files.filter((f) => !f.trashed)).toHaveLength(1);
    expect((await store.read("x.json"))?.content).toBe("do outro");
  });

  it("duplicado que já existe: sempre lê o mais antigo", async () => {
    const fake = fakeDrive();
    fake.create("x.json", "antigo");
    fake.create("x.json", "novo");
    const store = new DriveBlobStore("pasta", fake.drive);
    expect((await store.read("x.json"))?.content).toBe("antigo");
    expect((await store.versions())["x.json"]).toBe(md5("antigo"));
  });

  it("depois de listar a pasta, arquivo que não existe nem é consultado", async () => {
    const fake = fakeDrive();
    fake.create("a.json", "A");
    const store = new DriveBlobStore("pasta", fake.drive);
    await store.versions();
    let calls = 0;
    const list = fake.drive.files.list.bind(fake.drive.files);
    (fake.drive.files as unknown as { list: unknown }).list = async (...args: unknown[]) => {
      calls++;
      return (list as (...a: unknown[]) => unknown)(...args);
    };
    expect(await store.read("b.json")).toBeNull();
    expect((await store.read("a.json"))?.content).toBe("A");
    expect(calls).toBe(0);
  });
});

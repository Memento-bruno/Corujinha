import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/demo/seed";
import type { AppState } from "@/lib/client/store";
import { readinessItems } from "./readiness-card";

const mode: AppState["mode"] = {
  storage: "drive",
  demo: false,
  encrypted: true,
  authConfigured: true,
  driveConfigured: true,
  pluggyConfigured: true,
  bothUsersAllowed: true,
  autoBackupConfigured: false,
};

describe("pronto para o casal", () => {
  it("aponta o que falta para a segunda pessoa", () => {
    const cfg = defaultConfig();
    cfg.pluggyItems = [{ itemId: "a", owner: "USER_A" }];
    const items = Object.fromEntries(readinessItems(mode, cfg, null).map((i) => [i.id, i.status]));
    expect(items).toMatchObject({ login: "ok", drive: "ok", nome: "falta", entrou: "falta", "banco-a": "ok", "banco-b": "falta", copia: "falta" });
    expect(items.instalado).toBeUndefined();
  });

  it("fica tudo certo quando os dois estão configurados", () => {
    const cfg = defaultConfig({ b: "Patricia" });
    cfg.users.USER_B.onboardedAt = "2026-11-06T00:00:00Z";
    cfg.pluggyItems = [{ itemId: "a", owner: "USER_A" }, { itemId: "b", owner: "USER_B" }];
    const items = readinessItems({ ...mode, autoBackupConfigured: true }, cfg, true);
    expect(items.filter((i) => i.status === "falta")).toEqual([]);
  });
});

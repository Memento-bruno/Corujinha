import { describe, expect, it } from "vitest";
import { KEEP_ERRORS, mergeError, scrub } from "./error-log";

describe("registro de erros", () => {
  it("tira e-mails e números longos", () => {
    expect(scrub("falhou para fulano@gmail.com no valor 1.234,56 cartão 5502123412341234")).toBe(
      "falhou para [e-mail] no valor [número] cartão [número]",
    );
  });

  it("junta o mesmo erro e soma a contagem", () => {
    let list = mergeError([], { where: "tela", user: "USER_B", message: "x is undefined", path: "/faturas?m=1" }, "2026-11-06T10:00:00Z");
    list = mergeError(list, { where: "servidor", message: "outro" }, "2026-11-06T10:01:00Z");
    list = mergeError(list, { where: "tela", user: "USER_B", message: "x is undefined", path: "/faturas" }, "2026-11-06T10:02:00Z");
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ message: "x is undefined", count: 2, path: "/faturas", at: "2026-11-06T10:00:00Z", lastAt: "2026-11-06T10:02:00Z" });
  });

  it("guarda só os mais recentes", () => {
    let list = mergeError([], { where: "tela", message: "erro 0" });
    for (let i = 1; i < KEEP_ERRORS + 10; i++) list = mergeError(list, { where: "tela", message: `erro ${i}` });
    expect(list).toHaveLength(KEEP_ERRORS);
    expect(list[0].message).toBe(`erro ${KEEP_ERRORS + 9}`);
  });
});

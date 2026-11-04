import { describe, expect, it } from "vitest";
import { nextPagePath } from "./pluggy-client";

describe("nextPagePath", () => {
  const p = "/v2/transactions";
  it("anexa ?after=… ao caminho", () => expect(nextPagePath(p, "?after=abc%3D")).toBe("/v2/transactions?after=abc%3D"));
  it("aceita URL completa", () =>
    expect(nextPagePath(p, "https://api.pluggy.ai/v2/transactions?after=x&accountId=1")).toBe("/v2/transactions?after=x&accountId=1"));
  it("aceita caminho completo", () => expect(nextPagePath(p, "/v2/transactions?after=x")).toBe("/v2/transactions?after=x"));
  it("aceita cursor puro", () => expect(nextPagePath(p, "abc=")).toBe("/v2/transactions?after=abc%3D"));
});

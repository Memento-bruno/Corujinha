import { describe, expect, it } from "vitest";
import { formatSci } from "./money";

describe("formatSci (modo 10³)", () => {
  it("mostra só o número em milhares, sem a potência", () => {
    expect(formatSci(426_000)).toBe("R$ 4,26");
    expect(formatSci(40_000)).toBe("R$ 0,40");
    expect(formatSci(-207_000)).toBe("-R$ 2,07");
    expect(formatSci(426_000)).not.toContain("10");
  });
});

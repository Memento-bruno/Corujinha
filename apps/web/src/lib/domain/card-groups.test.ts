import { describe, expect, it } from "vitest";
import { cardGroups, rootCardId } from "./card-groups";
import type { CreditCard } from "./types";

const base = { owner: "USER_A" as const, nickname: "x", brand: "visa" as const, theme: 0 };
const cards: CreditCard[] = [
  { ...base, id: "card-pluggy-abcdef12", last4: "1111" },
  { ...base, id: "card-pluggy-abcdef12-2222", last4: "2222" },
  { ...base, id: "card-x", last4: "3333", parentId: "card-pluggy-abcdef12" },
  { ...base, id: "card-manual", last4: "4444" },
];

describe("card-groups", () => {
  it("junta virtuais e adicionais ao cartão principal", () => {
    expect(rootCardId("card-pluggy-abcdef12-2222", cards)).toBe("card-pluggy-abcdef12");
    expect(rootCardId("card-x", cards)).toBe("card-pluggy-abcdef12");
    expect(rootCardId("card-manual", cards)).toBe("card-manual");
    const g = cardGroups(cards);
    expect(g.map((x) => [x.card.id, x.children.map((c) => c.id)])).toEqual([
      ["card-pluggy-abcdef12", ["card-pluggy-abcdef12-2222", "card-x"]],
      ["card-manual", []],
    ]);
  });
});

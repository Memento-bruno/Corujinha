/**
 * Cartões virtuais e adicionais caem na mesma fatura do cartão principal.
 * Nas telas, eles aparecem juntos com o principal.
 */
import type { CreditCard } from "./types";

/** Id do cartão principal (o próprio id se ele já é o principal). */
export function rootCardId(cardId: string, cards: CreditCard[]): string {
  const card = cards.find((c) => c.id === cardId);
  if (card?.parentId && cards.some((c) => c.id === card.parentId)) return card.parentId;
  // Cartões virtuais criados pela sincronização antes de existir o vínculo: "card-pluggy-<conta>-<final>".
  const m = /^(card-pluggy-[0-9a-z-]{8})-\d{4}$/i.exec(cardId);
  if (m && cards.some((c) => c.id === m[1])) return m[1];
  return cardId;
}

/** Só os cartões principais, cada um com os virtuais/adicionais dele. */
export function cardGroups(cards: CreditCard[]): { card: CreditCard; children: CreditCard[] }[] {
  const groups = new Map<string, { card: CreditCard; children: CreditCard[] }>();
  for (const c of cards) if (rootCardId(c.id, cards) === c.id) groups.set(c.id, { card: c, children: [] });
  for (const c of cards) {
    const root = rootCardId(c.id, cards);
    if (root !== c.id) groups.get(root)?.children.push(c);
  }
  return [...groups.values()];
}

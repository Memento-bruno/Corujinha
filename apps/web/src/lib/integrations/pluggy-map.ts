/**
 * Conversão (pura, testável) dos dados da Pluggy para o modelo do Corujinha.
 * Escopo estrito: só contas de cartão de crédito, só leitura.
 */
import { addMonths } from "../domain/months";
import type { CardBrand, CreditCard, MonthKey, Transaction, UserId } from "../domain/types";
import { cleanDescription, guessCategory, merchantKeyOf } from "../importers/normalize";
import { isInvoicePayment } from "../importers/types";

export interface PluggyAccount {
  id: string;
  type: string; // "BANK" | "CREDIT"
  subtype?: string;
  number?: string | null;
  name?: string | null;
  marketingName?: string | null;
  creditData?: { brand?: string | null } | null;
}

export interface PluggyTransaction {
  id: string;
  description: string;
  descriptionRaw?: string | null;
  amount: number;
  /** Valor convertido para a moeda da conta (BRL) em compras internacionais. */
  amountInAccountCurrency?: number | null;
  currencyCode?: string | null;
  category?: string | null;
  date: string;
  type?: string;
  status?: string | null;
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    billId?: string | null;
    cardNumber?: string | null;
    purchaseDate?: string | null;
  } | null;
  merchant?: { name?: string | null; businessName?: string | null } | null;
}

export interface PluggyBill {
  id: string;
  dueDate: string;
  totalAmount?: number | null;
}

/** Valor em reais: compras em dólar vêm com `amount` na moeda original. */
export function brlAmount(t: PluggyTransaction): number {
  return typeof t.amountInAccountCurrency === "number" && t.amountInAccountCurrency !== 0 ? t.amountInAccountCurrency : t.amount;
}

/** Pagamento da fatura (não é gasto): pela categoria da Pluggy ou pela descrição. */
export function isCardPayment(t: PluggyTransaction): boolean {
  if (/credit card payment/i.test(t.category ?? "")) return true;
  return [t.description, t.descriptionRaw ?? ""].some(
    (d) => isInvoicePayment(d) || /\b(pag(to|amento)?|pgto)\.?\s*(de\s*)?(fatura|cart[aã]o)|deb(ito)?\.?\s*aut(om)?\.?\s*fatura/i.test(d),
  );
}

export function last4Of(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const digits = (c ?? "").replace(/\D/g, "");
    if (digits.length >= 4) return digits.slice(-4);
  }
  return null;
}

export function brandOf(raw?: string | null): CardBrand {
  const b = (raw ?? "").toLowerCase();
  if (b.includes("master")) return "mastercard";
  if (b.includes("visa")) return "visa";
  if (b.includes("elo")) return "elo";
  if (b.includes("amex") || b.includes("american")) return "amex";
  if (b.includes("hiper")) return "hipercard";
  return "outra";
}

/** Encontra (ou cria) o cartão do Corujinha que corresponde à conta de crédito da Pluggy. */
export function resolveCard(
  account: PluggyAccount,
  owner: UserId,
  cards: CreditCard[],
): { card: CreditCard; created: boolean } {
  const last4 = last4Of(account.number) ?? "0000";
  const existing = cards.find((c) => c.owner === owner && c.last4 === last4);
  if (existing) return { card: existing, created: false };
  const card: CreditCard = {
    id: `card-pluggy-${account.id.slice(0, 8)}`,
    owner,
    nickname: (account.marketingName || account.name || "Cartão").slice(0, 40),
    last4,
    brand: brandOf(account.creditData?.brand),
    theme: cards.length % 4,
  };
  return { card, created: true };
}

/**
 * A convenção de sinal das contas de cartão varia entre instituições. Em vez de supor,
 * medimos: numa fatura, a maioria dos lançamentos são compras. Se a maioria vier
 * negativa, invertemos para que gasto fique positivo, como no resto do app.
 */
export function expenseSign(txs: PluggyTransaction[]): 1 | -1 {
  const relevant = txs.filter((t) => !isCardPayment(t) && brlAmount(t) !== 0);
  const negatives = relevant.filter((t) => brlAmount(t) < 0).length;
  return relevant.length > 0 && negatives / relevant.length > 0.5 ? -1 : 1;
}

function monthOfIso(iso: string): MonthKey {
  return iso.slice(0, 7);
}

/** Converte as transações de UMA conta de cartão em transações do Corujinha, agrupadas por mês da fatura. */
export function mapCardTransactions(
  txs: PluggyTransaction[],
  card: CreditCard,
  bills: PluggyBill[],
  subscriptionMerchants: string[],
): Map<MonthKey, Transaction[]> {
  const sign = expenseSign(txs);
  const billMonth = new Map(bills.map((b) => [b.id, monthOfIso(b.dueDate)]));
  const out = new Map<MonthKey, Transaction[]>();
  for (const t of txs) {
    if ((t.status ?? "POSTED").toUpperCase() === "PENDING") continue;
    const rawDesc = t.merchant?.name || t.description || t.descriptionRaw || "";
    if (!rawDesc || isCardPayment(t)) continue;
    const cents = Math.round(brlAmount(t) * 100) * sign;
    if (cents === 0) continue;
    const description = cleanDescription(rawDesc).slice(0, 140) || "Compra";
    const merchantKey = merchantKeyOf(description);
    const category = guessCategory(description, merchantKey);
    const meta = t.creditCardMetadata;
    const installment =
      meta?.installmentNumber && meta?.totalInstallments && meta.totalInstallments > 1
        ? { current: meta.installmentNumber, total: meta.totalInstallments }
        : undefined;
    const date = t.date.slice(0, 10);
    // Sem fatura vinculada, a parcela N de uma compra antiga cai N-1 meses depois da compra.
    const fallback = installment ? addMonths(monthOfIso(date), installment.current - 1) : monthOfIso(date);
    const month = (meta?.billId && billMonth.get(meta.billId)) || fallback;
    const tx: Transaction = {
      id: `plg-${t.id}`,
      externalId: `pluggy:${t.id}`,
      date,
      description,
      merchantKey,
      amount: cents,
      cardId: card.id,
      paidBy: card.owner,
      category,
      tags: category === "assinaturas" || subscriptionMerchants.includes(merchantKey) ? ["Assinatura"] : [],
      split: { type: "SHARED_DEFAULT" },
      installment,
      source: "pluggy",
    };
    out.set(month, [...(out.get(month) ?? []), tx]);
  }
  return out;
}

/** Junta as novas transações às existentes, sem duplicar e sem mexer nas que o casal já editou. */
export function mergeNew(existing: Transaction[], incoming: Transaction[]): { merged: Transaction[]; added: number } {
  const known = new Set(existing.map((t) => t.externalId).filter(Boolean));
  const fresh = incoming.filter((t) => !known.has(t.externalId));
  return {
    merged: [...existing, ...fresh].sort((a, b) => a.date.localeCompare(b.date)),
    added: fresh.length,
  };
}

/**
 * Atualiza o mês com o que o banco informa, preservando o que o casal editou.
 * - Compra nova: entra.
 * - Compra do banco já salva: corrige valor, data e parcela; mantém divisão, categoria, tags e descrição.
 * - Compra do banco salva que não veio mais (virou pagamento, mudou de mês): sai.
 * Só mexe em compras `source: "pluggy"` dos cartões que sincronizaram com sucesso agora.
 */
export function reconcile(
  existing: Transaction[],
  incoming: Transaction[],
  syncedCardIds: Set<string>,
): { merged: Transaction[]; added: number; updated: number; removed: number } {
  const byExt = new Map(incoming.map((t) => [t.externalId, t]));
  const seen = new Set<string | undefined>();
  let updated = 0;
  let removed = 0;
  const kept: Transaction[] = [];
  for (const t of existing) {
    const managed = t.source === "pluggy" && syncedCardIds.has(t.cardId);
    if (!managed) {
      kept.push(t);
      continue;
    }
    const fresh = byExt.get(t.externalId);
    if (!fresh) {
      removed++;
      continue;
    }
    seen.add(t.externalId);
    const next = { ...t, amount: fresh.amount, date: fresh.date, installment: fresh.installment };
    if (next.amount !== t.amount || next.date !== t.date || JSON.stringify(next.installment) !== JSON.stringify(t.installment)) updated++;
    kept.push(next);
  }
  const known = new Set(existing.map((t) => t.externalId).filter(Boolean));
  const fresh = incoming.filter((t) => !seen.has(t.externalId) && !known.has(t.externalId));
  return {
    merged: [...kept, ...fresh].sort((a, b) => a.date.localeCompare(b.date)),
    added: fresh.length,
    updated,
    removed,
  };
}

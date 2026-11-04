/**
 * Conversão (pura, testável) dos dados da Pluggy para o modelo do Corujinha.
 * Escopo estrito: só contas de cartão de crédito, só leitura.
 */
import { addMonths, monthDiff } from "../domain/months";
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
 * Cada conta de crédito pode ter vários cartões (físico, virtuais, adicionais). A Pluggy informa
 * o final do cartão de cada compra em `creditCardMetadata.cardNumber`; usamos isso para separar.
 * Compras sem essa informação ficam no cartão principal da conta.
 */
export function cardResolver(account: PluggyAccount, owner: UserId, cards: CreditCard[]) {
  const pool = [...cards];
  const created: CreditCard[] = [];
  const { card: main, created: mainCreated } = resolveCard(account, owner, pool);
  if (mainCreated) {
    pool.push(main);
    created.push(main);
  }
  const base = (account.marketingName || account.name || "Cartão").slice(0, 30);
  const forLast4 = (last4: string | null): CreditCard => {
    if (!last4 || last4 === main.last4) return main;
    const existing = pool.find((c) => c.owner === owner && c.last4 === last4);
    if (existing) return existing;
    const card: CreditCard = {
      id: `card-pluggy-${account.id.slice(0, 8)}-${last4}`,
      owner,
      nickname: `${base} virtual`.slice(0, 40),
      last4,
      brand: main.brand,
      theme: pool.length % 4,
    };
    pool.push(card);
    created.push(card);
    return card;
  };
  return {
    main,
    created,
    forTx: (t: PluggyTransaction) => forLast4(last4Of(t.creditCardMetadata?.cardNumber)),
  };
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

/** Mês de vencimento estimado para compras sem fatura vinculada (fatura aberta). */
export function billPeriodEstimator(linked: { date: string; month: MonthKey }[]) {
  // Usa a fatura mais recente com compras à vista: a última compra dela marca o fechamento.
  let closingDay = 31;
  let shift = 0;
  const lastMonth = linked.map((l) => l.month).sort().pop();
  if (lastMonth) {
    const last = linked
      .filter((l) => l.month === lastMonth)
      .map((l) => l.date)
      .sort()
      .pop()!;
    closingDay = Number(last.slice(8, 10));
    shift = monthDiff(monthOfIso(last), lastMonth);
  }
  return (date: string): MonthKey =>
    addMonths(monthOfIso(date), shift + (Number(date.slice(8, 10)) > closingDay ? 1 : 0));
}

interface Draft {
  tx: Transaction;
  purchaseDate: string;
  /** O banco informou a data da compra original (então ela identifica a compra). */
  knownPurchaseDate: boolean;
  billMonth?: MonthKey;
}

const PROJECTED_TAG = "Prevista";

/**
 * Converte as transações de UMA conta de cartão em transações do Corujinha, agrupadas por mês da fatura.
 * - Compra com fatura vinculada vai sempre para o mês de vencimento dessa fatura (o banco manda; às vezes
 *   ele antecipa várias parcelas numa fatura só).
 * - Compras da fatura aberta (pendentes ou sem fatura) vão para o vencimento estimado pelo dia de fechamento.
 *   Parcelas sem fatura seguem a sequência de uma parcela da mesma compra que já tem fatura.
 * - As parcelas que o banco ainda não lançou entram como "Prevista" nos meses seguintes, para as faturas
 *   futuras baterem com o app do banco. Somem sozinhas quando a parcela real chega.
 */
export function mapCardTransactions(
  txs: PluggyTransaction[],
  cardOrResolver: CreditCard | ((t: PluggyTransaction) => CreditCard),
  bills: PluggyBill[],
  subscriptionMerchants: string[],
): Map<MonthKey, Transaction[]> {
  const cardFor = typeof cardOrResolver === "function" ? cardOrResolver : () => cardOrResolver;
  const sign = expenseSign(txs);
  const billMonth = new Map(bills.map((b) => [b.id, monthOfIso(b.dueDate)]));
  const drafts: Draft[] = [];
  for (const t of txs) {
    const rawDesc = t.merchant?.name || t.description || t.descriptionRaw || "";
    if (!rawDesc || isCardPayment(t)) continue;
    const cents = Math.round(brlAmount(t) * 100) * sign;
    if (cents === 0) continue;
    const description = cleanDescription(rawDesc).slice(0, 140) || "Compra";
    const merchantKey = merchantKeyOf(description);
    const category = guessCategory(description, merchantKey);
    const meta = t.creditCardMetadata;
    const card = cardFor(t);
    const installment =
      meta?.installmentNumber && meta?.totalInstallments && meta.totalInstallments > 1
        ? { current: meta.installmentNumber, total: meta.totalInstallments }
        : undefined;
    const date = t.date.slice(0, 10);
    drafts.push({
      purchaseDate: (meta?.purchaseDate || t.date).slice(0, 10),
      knownPurchaseDate: !!meta?.purchaseDate,
      billMonth: (meta?.billId && billMonth.get(meta.billId)) || undefined,
      tx: {
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
      },
    });
  }

  const estimate = billPeriodEstimator(
    drafts.filter((d) => d.billMonth && !d.tx.installment).map((d) => ({ date: d.tx.date, month: d.billMonth! })),
  );

  // Parcelas da mesma compra: mesma descrição, cartão, valor, total de parcelas e data da compra.
  const groups = new Map<string, Draft[]>();
  for (const d of drafts) {
    if (!d.tx.installment) continue;
    // Sem a data original, a data de cada parcela muda mês a mês: agrupamos sem ela.
    const k = [d.tx.cardId, d.tx.merchantKey, d.tx.amount, d.tx.installment.total, d.knownPurchaseDate ? d.purchaseDate : ""].join("|");
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const monthOfDraft = new Map<Draft, MonthKey>();
  for (const d of drafts) {
    if (d.billMonth) monthOfDraft.set(d, d.billMonth);
    else if (!d.tx.installment) monthOfDraft.set(d, estimate(d.tx.date));
  }
  for (const list of groups.values()) {
    const anchor = list
      .filter((d) => d.billMonth)
      .sort((a, b) => b.tx.installment!.current - a.tx.installment!.current || b.billMonth!.localeCompare(a.billMonth!))[0];
    for (const d of list) {
      if (d.billMonth) continue;
      const n = d.tx.installment!.current;
      monthOfDraft.set(
        d,
        anchor ? addMonths(anchor.billMonth!, n - anchor.tx.installment!.current) : addMonths(estimate(d.purchaseDate), n - 1),
      );
    }
  }

  const out = new Map<MonthKey, Transaction[]>();
  const push = (month: MonthKey, tx: Transaction) => out.set(month, [...(out.get(month) ?? []), tx]);
  for (const d of drafts) push(monthOfDraft.get(d)!, d.tx);

  // Parcelas futuras que o banco ainda não mandou (cada compra projeta as suas, mesmo que
  // haja outra compra igual na mesma loja).
  for (const list of groups.values()) {
    const have = new Set(list.map((d) => d.tx.installment!.current));
    const last = list.reduce((a, b) => (b.tx.installment!.current > a.tx.installment!.current ? b : a));
    const { current, total } = last.tx.installment!;
    const base = monthOfDraft.get(last)!;
    for (let n = current + 1; n <= Math.min(total, current + 36); n++) {
      if (have.has(n)) continue;
      push(addMonths(base, n - current), {
        ...last.tx,
        id: `${last.tx.id}-p${n}`,
        externalId: `${last.tx.externalId}:p${n}`,
        installment: { current: n, total },
        tags: [...last.tx.tags, PROJECTED_TAG],
      });
    }
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
    const next = { ...t, amount: fresh.amount, date: fresh.date, installment: fresh.installment, cardId: fresh.cardId, paidBy: fresh.paidBy, pluggyItemId: fresh.pluggyItemId ?? t.pluggyItemId };
    if (
      next.amount !== t.amount ||
      next.date !== t.date ||
      next.cardId !== t.cardId ||
      JSON.stringify(next.installment) !== JSON.stringify(t.installment)
    )
      updated++;
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

export type BillPaymentStatus = "paga" | "parcial" | "em aberto";

/**
 * Situação de cada fatura pelo que o banco mandou de pagamentos: soma os pagamentos feitos
 * depois do vencimento anterior até 5 dias depois deste vencimento.
 */
export function billPayments(bills: PluggyBill[], txs: PluggyTransaction[]): Map<string, { paid: number; status: BillPaymentStatus }> {
  const payments = txs.filter(isCardPayment).map((t) => ({ date: t.date.slice(0, 10), cents: Math.round(Math.abs(brlAmount(t)) * 100) }));
  const sorted = [...bills].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const plusDays = (iso: string, d: number) => new Date(Date.parse(iso.slice(0, 10)) + d * 86400000).toISOString().slice(0, 10);
  const out = new Map<string, { paid: number; status: BillPaymentStatus }>();
  sorted.forEach((b, i) => {
    const from = i > 0 ? plusDays(sorted[i - 1].dueDate, 5) : "0000-00-00";
    const to = plusDays(b.dueDate, 5);
    const paid = payments.filter((p) => p.date > from && p.date <= to).reduce((s, p) => s + p.cents, 0);
    const total = Math.round((b.totalAmount ?? 0) * 100);
    out.set(b.id, { paid, status: total <= 0 || paid >= total - 100 ? "paga" : paid > 0 ? "parcial" : "em aberto" });
  });
  return out;
}

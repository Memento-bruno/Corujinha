/**
 * Conversão (pura, testável) dos dados da Pluggy para o modelo do Corujinha.
 * Escopo estrito: só contas de cartão de crédito, só leitura.
 */
import { addMonths, monthDiff } from "../domain/months";
import { ownerSplit, type CardBrand, type CreditCard, type MonthKey, type Split, type Transaction, type UserId } from "../domain/types";
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
    /** Mês da fatura previsto pelo banco ("0001-01" = lançamento sem fatura válida). */
    billForecastDate?: string | null;
  } | null;
  merchant?: { name?: string | null; businessName?: string | null } | null;
}

export interface PluggyBill {
  id: string;
  dueDate: string;
  billClosingDate?: string | null;
  totalAmount?: number | null;
  /** Pagamentos que o banco registrou nessa fatura. */
  payments?: { paymentDate?: string | null; amount?: number | null }[] | null;
}

/** Valor em reais: compras em dólar vêm com `amount` na moeda original. */
export function brlAmount(t: PluggyTransaction): number {
  return typeof t.amountInAccountCurrency === "number" && t.amountInAccountCurrency !== 0 ? t.amountInAccountCurrency : t.amount;
}

/** Pagamento da fatura (não é gasto): pela categoria da Pluggy ou pela descrição. */
export function isCardPayment(t: PluggyTransaction): boolean {
  if (/credit card payment/i.test(t.category ?? "")) return true;
  // XP: o pagamento da fatura vem como "Pagamentos Validos Normais", na categoria "Transfers".
  if (/pagamentos?\s+v[aá]lidos/i.test(`${t.description} ${t.descriptionRaw ?? ""}`)) return true;
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
  /** Cartões que já existiam e ganharam o vínculo com o cartão principal. */
  const updated: CreditCard[] = [];
  const { card: main, created: mainCreated } = resolveCard(account, owner, pool);
  if (mainCreated) {
    pool.push(main);
    created.push(main);
  }
  const base = (account.marketingName || account.name || "Cartão").slice(0, 30);
  const forLast4 = (last4: string | null): CreditCard => {
    if (!last4 || last4 === main.last4) return main;
    const existing = pool.find((c) => c.owner === owner && c.last4 === last4);
    if (existing) {
      // Cartões virtuais/adicionais criados antes de existir o vínculo: liga ao cartão principal.
      if (!existing.parentId && existing.id !== main.id && existing.id.startsWith(`card-pluggy-${account.id.slice(0, 8)}-`)) {
        const linked = { ...existing, parentId: main.id };
        pool[pool.indexOf(existing)] = linked;
        updated.push(linked);
        return linked;
      }
      return existing;
    }
    const card: CreditCard = {
      id: `card-pluggy-${account.id.slice(0, 8)}-${last4}`,
      owner,
      nickname: `${base} final ${last4}`.slice(0, 40),
      last4,
      brand: main.brand,
      theme: main.theme,
      parentId: main.id,
    };
    pool.push(card);
    created.push(card);
    return card;
  };
  return {
    main,
    created,
    updated,
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
  month: MonthKey;
}

const PROJECTED_TAG = "Prevista";

/**
 * Converte as transações de UMA conta de cartão em transações do Corujinha, agrupadas por mês da fatura.
 * Conferido com os dados reais do Santander (Open Finance via Pluggy):
 * - Compra com fatura vinculada vai para o mês de vencimento dessa fatura.
 * - O resto (pendentes, sem fatura) é da fatura aberta: o mês seguinte à última fatura fechada.
 *   O banco já lança ali as parcelas do próximo ciclo assim que a fatura anterior fecha.
 * - Lançamentos com previsão de fatura inválida ("0001-01") não entram em fatura nenhuma.
 * - Parcelas futuras: para cada compra parcelada que tem parcela na fatura aberta, as parcelas
 *   seguintes entram como "Prevista", uma por mês. Compras que não aparecem na fatura aberta
 *   já terminaram ou foram antecipadas, e não geram previsão.
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
  const closingByMonth = new Map(bills.map((b) => [monthOfIso(b.dueDate), (b.billClosingDate ?? "").slice(0, 10)]));
  const lastBill = [...billMonth.values()].sort().at(-1);
  const openMonth = lastBill ? addMonths(lastBill, 1) : undefined;
  /**
   * Mês de uma compra sem fatura vinculada, pela previsão do banco:
   * - previsão depois da fatura aberta: parcela futura que o banco já informa (Nubank) → mês previsto;
   * - previsão numa fatura fechada, com data até o fechamento dela: já está naquela fatura → ignora;
   * - o resto é da fatura aberta.
   */
  const unlinkedMonth = (t: PluggyTransaction): MonthKey | null | undefined => {
    const forecast = t.creditCardMetadata?.billForecastDate?.slice(0, 7);
    if (!openMonth || !forecast || !/^\d{4}-\d{2}$/.test(forecast)) return undefined;
    if (forecast > openMonth) return forecast;
    const closing = closingByMonth.get(forecast);
    if (forecast <= lastBill! && closing && t.date.slice(0, 10) <= closing) return null;
    return openMonth;
  };
  const raw: { tx: Transaction; billMonth?: MonthKey; linked: boolean }[] = [];
  for (const t of txs) {
    const rawDesc = t.merchant?.name || t.description || t.descriptionRaw || "";
    if (!rawDesc || isCardPayment(t)) continue;
    const meta = t.creditCardMetadata;
    if (meta?.billForecastDate?.startsWith("0001")) continue;
    const cents = Math.round(brlAmount(t) * 100) * sign;
    if (cents === 0) continue;
    const description = cleanDescription(rawDesc).slice(0, 140) || "Compra";
    const merchantKey = merchantKeyOf(description);
    const category = guessCategory(description, merchantKey);
    const linked = (meta?.billId && billMonth.get(meta.billId)) || undefined;
    const unlinked = linked ? undefined : unlinkedMonth(t);
    if (unlinked === null) continue;
    const card = cardFor(t);
    const installment =
      meta?.installmentNumber && meta?.totalInstallments && meta.totalInstallments > 1
        ? { current: meta.installmentNumber, total: meta.totalInstallments }
        : undefined;
    raw.push({
      linked: Boolean(linked),
      billMonth: linked ?? unlinked,
      tx: {
        id: `plg-${t.id}`,
        externalId: `pluggy:${t.id}`,
        date: t.date.slice(0, 10),
        description,
        merchantKey,
        amount: cents,
        cardId: card.id,
        paidBy: card.owner,
        category,
        tags: category === "assinaturas" || subscriptionMerchants.includes(merchantKey) ? ["Assinatura"] : [],
        split: card.defaultSplit ?? ownerSplit(card.owner),
        installment,
        source: "pluggy",
      },
    });
  }

  // Sem nenhuma fatura informada, estimamos o mês pela data (parcela N cai N-1 meses depois).
  const estimate = (tx: Transaction): MonthKey =>
    addMonths(monthOfIso(tx.date), tx.installment ? tx.installment.current - 1 : 0);
  const placed: Draft[] = raw.map((r) => ({ tx: r.tx, month: r.billMonth ?? openMonth ?? estimate(r.tx) }));

  const out = new Map<MonthKey, Transaction[]>();
  const push = (month: MonthKey, tx: Transaction) => out.set(month, [...(out.get(month) ?? []), tx]);
  for (const d of placed) push(d.month, d.tx);

  // Mesma compra parcelada = mesmo cartão, loja, total de parcelas e mês da 1ª parcela.
  const groups = new Map<string, Draft[]>();
  for (const d of placed) {
    const i = d.tx.installment;
    if (!i) continue;
    const k = [d.tx.cardId, d.tx.merchantKey, i.total, addMonths(d.month, -i.current)].join("|");
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  // Alguns bancos (Santander) já lançam na fatura aberta as parcelas do próximo ciclo; outros (XP) só
  // lançam no fechamento. Nesse caso, as parcelas que faltam são previstas a partir da última fatura fechada.
  const inOpen = placed.filter((d) => d.month === openMonth);
  // Banco que nunca manda parcela fora de fatura fechada (XP) só lança as parcelas no fechamento.
  // Vale também com a fatura aberta vazia, logo depois do fechamento.
  const neverUnlinkedInstallments = !raw.some((r) => !r.linked && r.tx.installment);
  const openWithoutInstallments = !inOpen.some((d) => d.tx.installment) && (inOpen.length > 0 || neverUnlinkedInstallments);
  const latest = openWithoutInstallments && lastBill ? lastBill : (openMonth ?? placed.map((d) => d.month).sort().at(-1));
  for (const list of groups.values()) {
    const top = Math.max(...list.map((d) => d.tx.installment!.current));
    // Cada compra com a parcela mais recente na fatura aberta projeta as que faltam.
    for (const last of list.filter((d) => d.tx.installment!.current === top && d.month === latest)) {
      const { current, total } = last.tx.installment!;
      for (let n = current + 1; n <= Math.min(total, current + 36); n++) {
        push(addMonths(last.month, n - current), {
          ...last.tx,
          id: `${last.tx.id}-p${n}`,
          externalId: `${last.tx.externalId}:p${n}`,
          installment: { current: n, total },
          tags: [...last.tx.tags, PROJECTED_TAG],
        });
      }
    }
  }

  // Faturas fechadas: o banco às vezes cobra coisas que não vêm como compra (parcela de fatura
  // parcelada, tarifas). Um lançamento de ajuste faz o total do mês bater com o da fatura.
  for (const b of bills) {
    // Total zero (ou crédito) quer dizer que o banco não informou o valor: não dá para completar.
    if (typeof b.totalAmount !== "number" || b.totalAmount <= 0) continue;
    const m = monthOfIso(b.dueDate);
    const sum = (out.get(m) ?? []).reduce((acc, t) => acc + t.amount, 0);
    const diff = Math.round(b.totalAmount * 100) - sum;
    if (diff === 0 || !out.has(m)) continue;
    // Sem dados de compra, o resolvedor devolve o cartão principal da conta.
    const card = cardFor({ id: `ajuste-${b.id}`, description: "", amount: 0, date: b.dueDate });
    push(m, {
      id: `plg-ajuste-${b.id}`,
      externalId: `pluggy:ajuste:${b.id}`,
      date: (b.billClosingDate ?? b.dueDate).slice(0, 10),
      description: "Outros lançamentos da fatura",
      // Um por cartão: a divisão lembrada para o ajuste de um cartão não vale para os outros.
      merchantKey: `ajuste-fatura-${card.id}`.slice(0, 80),
      amount: diff,
      cardId: card.id,
      paidBy: card.owner,
      category: "outros",
      tags: [],
        split: card.defaultSplit ?? ownerSplit(card.owner),
      source: "pluggy",
    });
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
    const next = {
      ...t,
      // Ajuste antigo (de antes de ter um por cartão) passa a usar o nome por cartão.
      ...(t.merchantKey === "ajuste-fatura" ? { merchantKey: fresh.merchantKey } : {}),
      amount: fresh.amount, date: fresh.date, installment: fresh.installment, cardId: fresh.cardId, paidBy: fresh.paidBy, pluggyItemId: fresh.pluggyItemId ?? t.pluggyItemId };
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
  const gone = existing.filter((t) => t.source === "pluggy" && syncedCardIds.has(t.cardId) && !byExt.has(t.externalId));
  const fresh = incoming
    .filter((t) => !seen.has(t.externalId) && !known.has(t.externalId))
    .map((t) => inheritEdits(t, gone));
  return {
    merged: [...kept, ...fresh].sort((a, b) => a.date.localeCompare(b.date)),
    added: fresh.length,
    updated,
    removed,
  };
}

/**
 * A mesma compra às vezes volta do banco com outro id: a parcela prevista vira a parcela real,
 * ou a compra pendente é lançada na fatura. A nova herda a divisão, o setor, a descrição e as
 * tags que o casal tinha escolhido na antiga.
 */
function inheritEdits(t: Transaction, gone: Transaction[]): Transaction {
  const i = t.installment;
  const old =
    (i &&
      gone.find(
        (g) => g.cardId === t.cardId && g.merchantKey === t.merchantKey && g.installment?.current === i.current && g.installment?.total === i.total,
      )) ||
    (!i && gone.find((g) => !g.installment && g.cardId === t.cardId && g.merchantKey === t.merchantKey && g.amount === t.amount && g.date === t.date));
  if (!old) return t;
  gone.splice(gone.indexOf(old), 1);
  const userTags = old.tags.filter((x) => x !== PROJECTED_TAG && !t.tags.includes(x));
  return { ...t, split: old.split, category: old.category, description: old.description, tags: [...t.tags, ...userTags] };
}

/**
 * Estorno herda a divisão da compra original (mesmo cartão e loja; de preferência o mesmo valor),
 * para não desequilibrar o acerto quando a compra era só de um dos dois.
 */
export function refundSplitIndex() {
  const byKey = new Map<string, { amount: number; split: Split }[]>();
  const keyOf = (t: Pick<Transaction, "cardId" | "merchantKey">) => `${t.cardId}|${t.merchantKey}`;
  return {
    add(txs: Transaction[]) {
      for (const t of txs) {
        if (t.amount <= 0 || !t.merchantKey || t.merchantKey === "desconhecido") continue;
        byKey.set(keyOf(t), [...(byKey.get(keyOf(t)) ?? []), { amount: t.amount, split: t.split }]);
      }
    },
    apply(t: Transaction): Transaction {
      if (t.amount >= 0) return t;
      const list = byKey.get(keyOf(t));
      if (!list?.length) return t;
      const same = [...list].reverse().find((p) => p.amount === -t.amount) ?? list[list.length - 1];
      return { ...t, split: same.split };
    },
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
    // O que o próprio banco registrou na fatura vale mais que adivinhar pelos lançamentos.
    const fromBill = (b.payments ?? []).reduce((s, p) => s + Math.round(Math.abs(p.amount ?? 0) * 100), 0);
    const fromTxs = payments.filter((p) => p.date > from && p.date <= to).reduce((s, p) => s + p.cents, 0);
    const paid = Math.max(fromBill, fromTxs);
    const total = Math.round((b.totalAmount ?? 0) * 100);
    out.set(b.id, { paid, status: total <= 0 || paid >= total - 100 ? "paga" : paid > 0 ? "parcial" : "em aberto" });
  });
  return out;
}

import "server-only";
import { addMonths, monthOf } from "../domain/months";
import type { BankBill, HouseholdConfig, MonthKey, Transaction } from "../domain/types";
import { applyMerchantRule } from "../engines/merchants";
import { applyCardRecurring } from "../engines/recurring";
import { ConflictError } from "../server/blob-store";
import type { DriveDatabaseService } from "../server/database";
import { getBills, getCreditAccounts, getTransactions } from "./pluggy-client";
import { billPayments, cardResolver, mapCardTransactions, reconcile, refundSplitIndex } from "./pluggy-map";

export interface SyncSummary {
  added: number;
  /** Compras já salvas cujo valor/data o banco corrigiu. */
  updated: number;
  /** Compras que saíram (viraram pagamento de fatura ou mudaram de mês). */
  removed: number;
  months: Record<MonthKey, number>;
  skippedClosedMonths: MonthKey[];
  newCards: string[];
  accounts: number;
  errors: string[];
}

/**
 * Busca as faturas dos cartões conectados (Meu Pluggy) e grava as transações novas.
 * - Lê só contas de crédito, só leitura.
 * - Não altera transações já existentes (as divisões e tags que o casal editou ficam).
 * - Compras novas de uma recorrente de cartão já chegam com a divisão e o setor dela.
 * - Não mexe em meses já fechados.
 */
export async function syncPluggy(db: DriveDatabaseService, monthsBack = 3): Promise<SyncSummary> {
  const summary: SyncSummary = { added: 0, updated: 0, removed: 0, months: {}, skippedClosedMonths: [], newCards: [], accounts: 0, errors: [] };
  const cfgV = await db.getConfig();
  const cfg: HouseholdConfig = structuredClone(cfgV.data);
  const items = cfg.pluggyItems ?? [];
  if (items.length === 0) {
    summary.errors.push("Nenhuma conexão cadastrada. Adicione o itemId em Ajustes → Open Finance.");
    return summary;
  }
  // Uma fatura junta compras de até ~2 meses antes do vencimento: buscamos com folga
  // e só gravamos os meses dentro da janela, para o mês mais antigo não vir pela metade.
  const firstMonth = addMonths(monthOf(new Date()), -monthsBack);
  // Parcelas de compras antigas vêm com a data da compra original: buscamos 2 anos para trás.
  const from = `${addMonths(firstMonth, -24)}-01`;
  const byMonth = new Map<MonthKey, Transaction[]>();
  const billsByMonth = new Map<MonthKey, Record<string, BankBill>>();

  let okItems = 0;
  /** Cartões virtuais já salvos que ganharam o vínculo com o cartão principal (id → principal). */
  const linkedCards = new Map<string, string>();
  const syncedCardIds = new Set<string>();
  for (const item of items) {
    try {
      const accounts = await getCreditAccounts(item.itemId);
      for (const account of accounts) {
        summary.accounts++;
        const resolver = cardResolver(account, item.owner, cfg.cards);
        const [txs, bills] = await Promise.all([getTransactions(account.id, from), getBills(account.id)]);
        const mapped = mapCardTransactions(txs, resolver.forTx, bills, cfg.subscriptionMerchants);
        const pay = billPayments(bills, txs);
        for (const b of bills) {
          const m = b.dueDate.slice(0, 7);
          if (m < firstMonth) continue;
          const p = pay.get(b.id)!;
          billsByMonth.set(m, { ...billsByMonth.get(m), [resolver.main.id]: { total: Math.round((b.totalAmount ?? 0) * 100), paid: p.paid, status: p.status } });
        }
        for (const c of resolver.created) {
          cfg.cards.push(c);
          summary.newCards.push(`${c.nickname} •${c.last4}`);
        }
        for (const c of resolver.updated) {
          cfg.cards = cfg.cards.map((x) => (x.id === c.id ? c : x));
          linkedCards.set(c.id, c.parentId!);
        }
        // Só marca o cartão como sincronizado depois de ler tudo dele sem erro.
        for (const [m, list] of mapped) {
          if (m < firstMonth) continue;
          for (const t of list) t.pluggyItemId = item.itemId;
          byMonth.set(m, [...(byMonth.get(m) ?? []), ...list]);
        }
        syncedCardIds.add(resolver.main.id);
        for (const c of resolver.created) syncedCardIds.add(c.id);
        for (const list of mapped.values()) for (const t of list) syncedCardIds.add(t.cardId);
      }
      okItems++;
    } catch (e) {
      summary.errors.push(`Conexão ${item.itemId.slice(0, 8)}…: ${(e as Error).message}`);
    }
  }

  if (okItems === 0) return summary;

  // Salva cartões novos antes das transações que apontam para eles (relendo para não sobrescrever edições).
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await db.getConfig();
    const known = new Set(latest.data.cards.map((c) => c.id));
    const next = {
      ...latest.data,
      cards: [
        ...latest.data.cards.map((c) => (linkedCards.has(c.id) && !c.parentId ? { ...c, parentId: linkedCards.get(c.id) } : c)),
        ...cfg.cards.filter((c) => !known.has(c.id)),
      ],
      pluggyLastSyncAt: new Date().toISOString(),
    };
    try {
      await db.saveConfig(next, latest.etag);
      break;
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt === 2) throw e;
    }
  }
  // Passa por todos os meses da janela (inclusive os que ficaram vazios), até 2 meses à frente.
  const lastMonth = addMonths(monthOf(new Date()), 2);
  const months = new Set<MonthKey>([...byMonth.keys(), ...billsByMonth.keys()]);
  for (let m = firstMonth; m <= lastMonth; m = addMonths(m, 1)) months.add(m);
  // E os meses já salvos (ex.: parcelas previstas lá na frente), para limpar o que mudou.
  // Meses antigos entram só para limpar compras de conexões removidas.
  for (const m of await db.listStatementMonths()) months.add(m);
  const itemIds = new Set(items.map((i) => i.itemId));
  const debts = (await db.getRecurring()).data.debts;
  const allClean = summary.errors.length === 0;
  // Compra do banco de uma conexão que não existe mais (ou de cartão que nenhuma conexão trouxe).
  const isOrphan = (t: Transaction) =>
    allClean && t.source === "pluggy" && (t.pluggyItemId ? !itemIds.has(t.pluggyItemId) : !syncedCardIds.has(t.cardId));
  const cardById = new Map(cfg.cards.map((c) => [c.id, c]));
  /** Divisão definida no cartão (ex.: adicional de um dos dois) vale mais que a lembrada da loja. */
  const withCardSplit = (t: Transaction): Transaction => {
    const s = cardById.get(t.cardId)?.defaultSplit;
    return s ? { ...t, split: s } : t;
  };
  // Os meses vão do mais antigo para o mais novo: o estorno encontra a compra original nos meses anteriores.
  const refunds = refundSplitIndex();
  for (const month of [...months].sort()) {
    const mapped = (byMonth.get(month) ?? []).map((t) => applyCardRecurring(debts, withCardSplit(applyMerchantRule(cfg.merchantRules, t))));
    let incoming = mapped;
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await db.getStatement(month);
      if (attempt === 0) refunds.add([...cur.data.transactions, ...mapped.filter((t) => !cur.data.transactions.some((x) => x.externalId === t.externalId))]);
      incoming = mapped.map((t) => refunds.apply(t));
      if (cur.data.snapshot) {
        if (incoming.length) summary.skippedClosedMonths.push(month);
        break;
      }
      const base =
        month < firstMonth
          ? { merged: cur.data.transactions, added: 0, updated: 0, removed: 0 }
          : reconcile(cur.data.transactions, incoming, syncedCardIds);
      const merged = base.merged.filter((t) => !isOrphan(t));
      const r = { ...base, merged, removed: base.removed + (base.merged.length - merged.length) };
      const bankBills = billsByMonth.has(month) ? { ...cur.data.bankBills, ...billsByMonth.get(month) } : cur.data.bankBills;
      const billsChanged = JSON.stringify(bankBills ?? null) !== JSON.stringify(cur.data.bankBills ?? null);
      if (r.added === 0 && r.updated === 0 && r.removed === 0 && !billsChanged) break;
      if (cur.etag === null && r.merged.length === 0 && !billsChanged) break;
      try {
        await db.saveStatement({ ...cur.data, transactions: r.merged, ...(bankBills ? { bankBills } : {}) }, cur.etag);
        summary.added += r.added;
        summary.updated += r.updated;
        summary.removed += r.removed;
        if (r.added) summary.months[month] = r.added;
        break;
      } catch (e) {
        if (!(e instanceof ConflictError) || attempt === 2) throw e;
      }
    }
  }

  return summary;
}

/** Apaga as compras que vieram do banco (Open Finance) dos meses abertos. Meses fechados ficam como estão. */
export async function clearPluggyTransactions(
  db: DriveDatabaseService,
  match: (t: Transaction) => boolean = () => true,
): Promise<{ removed: number; skippedClosedMonths: MonthKey[] }> {
  let removed = 0;
  const skippedClosedMonths: MonthKey[] = [];
  for (const month of await db.listStatementMonths()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await db.getStatement(month);
      const keep = cur.data.transactions.filter((t) => t.source !== "pluggy" || !match(t));
      const gone = cur.data.transactions.length - keep.length;
      if (gone === 0 && !cur.data.bankBills) break;
      if (cur.data.snapshot) {
        skippedClosedMonths.push(month);
        break;
      }
      try {
        // A situação das faturas do banco volta na próxima sincronização.
        const { bankBills: _drop, ...rest } = cur.data;
        void _drop;
        await db.saveStatement({ ...rest, transactions: keep }, cur.etag);
        removed += gone;
        break;
      } catch (e) {
        if (!(e instanceof ConflictError) || attempt === 2) throw e;
      }
    }
  }
  return { removed, skippedClosedMonths };
}

/**
 * Desconecta uma conexão Open Finance: tira do cadastro, apaga as compras que vieram dela
 * (meses fechados ficam) e os cartões criados por ela que ficaram sem compras.
 */
export async function disconnectPluggyItem(db: DriveDatabaseService, itemId: string) {
  // Cartões das contas dessa conexão, para compras antigas gravadas antes de guardarmos a conexão.
  const before = (await db.getConfig()).data;
  const remaining = (before.pluggyItems ?? []).filter((i) => i.itemId !== itemId);
  let itemCards: Set<string> | null = null;
  if (remaining.length > 0) {
    try {
      const owner = (before.pluggyItems ?? []).find((i) => i.itemId === itemId)?.owner ?? "USER_A";
      itemCards = new Set();
      for (const acc of await getCreditAccounts(itemId)) {
        const prefix = `card-pluggy-${acc.id.slice(0, 8)}`;
        itemCards.add(cardResolver(acc, owner, before.cards).main.id);
        for (const c of before.cards) if (c.id.startsWith(prefix)) itemCards.add(c.id);
      }
    } catch {
      itemCards = new Set();
    }
  }
  const match = (t: Transaction) =>
    remaining.length === 0 || t.pluggyItemId === itemId || (!t.pluggyItemId && (itemCards?.has(t.cardId) ?? false));
  const result = await clearPluggyTransactions(db, match);

  // Cartões criados pelo Open Finance que não têm mais nenhuma compra.
  const used = new Set<string>();
  for (const m of await db.listStatementMonths()) for (const t of (await db.getStatement(m)).data.transactions) used.add(t.cardId);
  let removedCards = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await db.getConfig();
    const cards = latest.data.cards.filter(
      (c) => !c.id.startsWith("card-pluggy-") || used.has(c.id) || (remaining.length > 0 && !itemCards?.has(c.id)),
    );
    removedCards = latest.data.cards.length - cards.length;
    try {
      await db.saveConfig(
        { ...latest.data, cards, pluggyItems: (latest.data.pluggyItems ?? []).filter((i) => i.itemId !== itemId) },
        latest.etag,
      );
      break;
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt === 2) throw e;
    }
  }
  return { ...result, removedCards };
}

import "server-only";
import { addMonths, monthOf } from "../domain/months";
import type { HouseholdConfig, MonthKey, Transaction } from "../domain/types";
import { ConflictError } from "../server/blob-store";
import type { DriveDatabaseService } from "../server/database";
import { getBills, getCreditAccounts, getTransactions } from "./pluggy-client";
import { cardResolver, mapCardTransactions, reconcile } from "./pluggy-map";

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

  let okItems = 0;
  const syncedCardIds = new Set<string>();
  for (const item of items) {
    try {
      const accounts = await getCreditAccounts(item.itemId);
      for (const account of accounts) {
        summary.accounts++;
        const resolver = cardResolver(account, item.owner, cfg.cards);
        const [txs, bills] = await Promise.all([getTransactions(account.id, from), getBills(account.id)]);
        const mapped = mapCardTransactions(txs, resolver.forTx, bills, cfg.subscriptionMerchants);
        for (const c of resolver.created) {
          cfg.cards.push(c);
          summary.newCards.push(`${c.nickname} •${c.last4}`);
        }
        // Só marca o cartão como sincronizado depois de ler tudo dele sem erro.
        for (const [m, list] of mapped) {
          if (m < firstMonth) continue;
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
      cards: [...latest.data.cards, ...cfg.cards.filter((c) => !known.has(c.id))],
      pluggyLastSyncAt: new Date().toISOString(),
    };
    try {
      await db.saveConfig(next, latest.etag);
      break;
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt === 2) throw e;
    }
  }
  // Passa por todos os meses da janela (inclusive os que ficaram vazios), até 12 meses à frente (parcelas futuras).
  const lastMonth = addMonths(monthOf(new Date()), 12);
  const months = new Set<MonthKey>(byMonth.keys());
  for (let m = firstMonth; m <= lastMonth; m = addMonths(m, 1)) months.add(m);
  for (const month of [...months].sort()) {
    const incoming = byMonth.get(month) ?? [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await db.getStatement(month);
      if (cur.data.snapshot) {
        if (incoming.length) summary.skippedClosedMonths.push(month);
        break;
      }
      const r = reconcile(cur.data.transactions, incoming, syncedCardIds);
      if (r.added === 0 && r.updated === 0 && r.removed === 0) break;
      if (cur.etag === null && r.merged.length === 0) break;
      try {
        await db.saveStatement({ ...cur.data, transactions: r.merged }, cur.etag);
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

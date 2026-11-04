import "server-only";
import { addMonths, monthOf } from "../domain/months";
import type { HouseholdConfig, MonthKey, Transaction } from "../domain/types";
import { ConflictError } from "../server/blob-store";
import type { DriveDatabaseService } from "../server/database";
import { getBills, getCreditAccounts, getTransactions } from "./pluggy-client";
import { mapCardTransactions, mergeNew, resolveCard } from "./pluggy-map";

export interface SyncSummary {
  added: number;
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
  const summary: SyncSummary = { added: 0, months: {}, skippedClosedMonths: [], newCards: [], accounts: 0, errors: [] };
  const cfgV = await db.getConfig();
  const cfg: HouseholdConfig = structuredClone(cfgV.data);
  const items = cfg.pluggyItems ?? [];
  if (items.length === 0) {
    summary.errors.push("Nenhuma conexão cadastrada. Adicione o itemId em Ajustes → Open Finance.");
    return summary;
  }
  const from = `${addMonths(monthOf(new Date()), -monthsBack)}-01`;
  const byMonth = new Map<MonthKey, Transaction[]>();

  let okItems = 0;
  for (const item of items) {
    try {
      const accounts = await getCreditAccounts(item.itemId);
      for (const account of accounts) {
        summary.accounts++;
        const { card, created } = resolveCard(account, item.owner, cfg.cards);
        if (created) {
          cfg.cards.push(card);
          summary.newCards.push(`${card.nickname} •${card.last4}`);
        }
        const [txs, bills] = await Promise.all([getTransactions(account.id, from), getBills(account.id)]);
        for (const [m, list] of mapCardTransactions(txs, card, bills, cfg.subscriptionMerchants)) {
          byMonth.set(m, [...(byMonth.get(m) ?? []), ...list]);
        }
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
  for (const [month, incoming] of byMonth) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await db.getStatement(month);
      if (cur.data.snapshot) {
        summary.skippedClosedMonths.push(month);
        break;
      }
      const { merged, added } = mergeNew(cur.data.transactions, incoming);
      if (added === 0) break;
      try {
        await db.saveStatement({ ...cur.data, transactions: merged }, cur.etag);
        summary.added += added;
        summary.months[month] = added;
        break;
      } catch (e) {
        if (!(e instanceof ConflictError) || attempt === 2) throw e;
      }
    }
  }

  return summary;
}

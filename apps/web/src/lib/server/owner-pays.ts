import "server-only";
import { ownerSplit, type HouseholdConfig, type MerchantRule, type Transaction } from "../domain/types";
import { cardRecurringFor } from "../engines/recurring";
import { ConflictError } from "./blob-store";
import type { DriveDatabaseService } from "./database";

/**
 * Regra do casal (2026-11): toda compra de cartão é de quem é o dono da fatura.
 * Conversão feita uma vez só, nos meses ainda abertos (meses fechados ficam como estão):
 * - as compras de cartão passam a ser 100% do dono do cartão;
 * - ficam de fora as que seguem uma recorrente de cartão (a divisão dela foi escolhida à mão);
 * - a memória de fornecedores esquece "quem paga" (era aprendida sozinha). Só o botão
 *   "Sempre dividir" grava isso de agora em diante.
 * Depois disso, o que o casal mudar à mão fica como está.
 */
export function convertMonthToOwnerPays(
  txs: Transaction[],
  cfg: Pick<HouseholdConfig, "cards">,
  debts: Parameters<typeof cardRecurringFor>[0],
): { transactions: Transaction[]; changed: number } {
  const owners = new Map(cfg.cards.map((c) => [c.id, c.owner]));
  let changed = 0;
  const transactions = txs.map((t) => {
    const owner = owners.get(t.cardId) ?? t.paidBy;
    const recurring = cardRecurringFor(debts, t);
    if (recurring?.active) return t;
    const want = ownerSplit(owner);
    if (t.split.type === want.type) return t;
    changed++;
    return { ...t, split: want };
  });
  return { transactions, changed };
}

export function forgetLearnedSplits(rules: Record<string, MerchantRule> | undefined): Record<string, MerchantRule> | undefined {
  if (!rules) return rules;
  const out: Record<string, MerchantRule> = {};
  for (const [k, r] of Object.entries(rules)) {
    const { split: _drop, ...rest } = r;
    void _drop;
    if (rest.category) out[k] = rest;
  }
  return out;
}

/** Depois de feita, o servidor nem confere de novo (até reiniciar). */
let done = false;

export async function ensureOwnerPaysCards(db: DriveDatabaseService): Promise<void> {
  if (done) return;
  const first = await db.getConfig();
  if (first.data.ownerPaysCardsAt) {
    done = true;
    return;
  }
  // Casa nova (ainda sem cadastro salvo): não há o que converter.
  if (first.etag === null) return;
  const debts = (await db.getRecurring()).data.debts;
  for (const month of await db.listStatementMonths()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await db.getStatement(month);
      if (cur.data.snapshot) break;
      const r = convertMonthToOwnerPays(cur.data.transactions, first.data, debts);
      if (r.changed === 0) break;
      try {
        await db.saveStatement({ ...cur.data, transactions: r.transactions }, cur.etag);
        break;
      } catch (e) {
        if (!(e instanceof ConflictError) || attempt === 2) throw e;
      }
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await db.getConfig();
    if (latest.data.ownerPaysCardsAt) return;
    try {
      await db.saveConfig(
        { ...latest.data, merchantRules: forgetLearnedSplits(latest.data.merchantRules), ownerPaysCardsAt: new Date().toISOString() },
        latest.etag,
      );
      done = true;
      return;
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt === 2) throw e;
    }
  }
}

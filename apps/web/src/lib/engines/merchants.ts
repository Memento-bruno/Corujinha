/**
 * Memória de fornecedores: quando o casal muda o setor ou a divisão de uma compra, o app
 * guarda a escolha para aquele estabelecimento (merchantKey). Compra nova do mesmo lugar
 * já chega com o setor e a divisão certos. Regra simples, sem IA.
 */
import type { CategoryId, HouseholdConfig, MerchantRule, Split, Transaction } from "../domain/types";

export type MerchantRules = Record<string, MerchantRule>;

function sameSplit(a: Split, b: Split): boolean {
  return a.type === b.type && (a.type !== "SHARED_CUSTOM" || a.percentA === b.percentA);
}

/** Aplica a regra do fornecedor numa compra que acabou de chegar. */
export function applyMerchantRule(rules: MerchantRules | undefined, tx: Transaction): Transaction {
  const r = rules?.[tx.merchantKey];
  if (!r || !tx.merchantKey || tx.merchantKey === "desconhecido") return tx;
  return { ...tx, ...(r.category ? { category: r.category } : {}), ...(r.split ? { split: r.split } : {}) };
}

/** Guarda (ou atualiza) o que foi escolhido para o fornecedor da compra. */
export function learnMerchant(
  rules: MerchantRules | undefined,
  tx: Pick<Transaction, "merchantKey" | "description">,
  change: { category?: CategoryId; split?: Split },
  now = new Date().toISOString(),
): MerchantRules {
  const out = { ...rules };
  if (!tx.merchantKey || tx.merchantKey === "desconhecido") return out;
  const cur = out[tx.merchantKey];
  out[tx.merchantKey] = {
    name: tx.description.slice(0, 140) || tx.merchantKey,
    ...(cur?.category ? { category: cur.category } : {}),
    ...(cur?.split ? { split: cur.split } : {}),
    ...change,
    updatedAt: now,
  };
  return out;
}

/**
 * Outras compras do mesmo fornecedor que ainda estavam com o valor antigo passam para o novo.
 * Devolve a lista nova e quantas mudaram (sem contar a própria compra editada).
 */
export function propagateToSameMerchant(
  txs: Transaction[],
  before: Transaction,
  after: Transaction,
): { transactions: Transaction[]; changed: number } {
  const catChanged = before.category !== after.category;
  const splitChanged = !sameSplit(before.split, after.split);
  let changed = 0;
  const transactions = txs.map((t) => {
    if (t.id === after.id) return after;
    if (t.merchantKey !== after.merchantKey || !after.merchantKey || after.merchantKey === "desconhecido") return t;
    let n = t;
    if (catChanged && t.category === before.category) n = { ...n, category: after.category };
    if (splitChanged && sameSplit(t.split, before.split)) n = { ...n, split: after.split };
    if (n !== t) changed++;
    return n;
  });
  return { transactions, changed };
}

/** Fornecedores guardados, do mais recente para o mais antigo. */
export function merchantList(cfg: HouseholdConfig): { key: string; rule: MerchantRule }[] {
  return Object.entries(cfg.merchantRules ?? {})
    .map(([key, rule]) => ({ key, rule }))
    .sort((a, b) => b.rule.updatedAt.localeCompare(a.rule.updatedAt));
}

/**
 * Compra nova que vale conferir: o app não conhece o fornecedor, não é parcela de compra
 * antiga (já conferida no mês da 1ª parcela) nem a linha de ajuste da fatura, e é recente
 * (até 40 dias), para a primeira sincronização não encher a lista com meses antigos.
 */
export function shouldReview(rules: MerchantRules | undefined, tx: Transaction, today = new Date()): boolean {
  if (tx.amount <= 0 || tx.merchantKey === "ajuste-fatura") return false;
  if (tx.installment && tx.installment.current > 1) return false;
  if (tx.merchantKey && rules?.[tx.merchantKey]) return false;
  const age = (today.getTime() - Date.parse(tx.date)) / 86_400_000;
  return age <= 40;
}

/** Marca a compra para revisão quando ela precisa. */
export function flagForReview(rules: MerchantRules | undefined, tx: Transaction, today = new Date()): Transaction {
  return shouldReview(rules, tx, today) ? { ...tx, toReview: true } : tx;
}

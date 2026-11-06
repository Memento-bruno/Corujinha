/**
 * Memória de fornecedores: quando o casal muda o setor ou a divisão de uma compra, o app
 * guarda a escolha para aquele estabelecimento (merchantKey). Compra nova do mesmo lugar
 * já chega com o setor e a divisão certos. Regra simples, sem IA.
 */
import { isSharedSplit, type CategoryId, type HouseholdConfig, type MerchantRule, type Split, type Transaction } from "../domain/types";

export type MerchantRules = Record<string, MerchantRule>;

function sameSplit(a: Split, b: Split): boolean {
  return a.type === b.type && (a.type !== "SHARED_CUSTOM" || a.percentA === b.percentA);
}

/**
 * Aplica a regra do fornecedor numa compra que acabou de chegar.
 * Compra de cartão é sempre do dono da fatura: a regra só muda a divisão quando o casal marcou
 * aquela loja como dividida. "Só fulano" na regra não passa a compra para o outro.
 */
export function applyMerchantRule(rules: MerchantRules | undefined, tx: Transaction): Transaction {
  const r = rules?.[tx.merchantKey];
  if (!r || !tx.merchantKey || tx.merchantKey === "desconhecido") return tx;
  return { ...tx, ...(r.category ? { category: r.category } : {}), ...(isSharedSplit(r.split) ? { split: r.split } : {}) };
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
 * Botão "Sempre dividir": grava (ou apaga, com null) a divisão da loja para as próximas compras.
 * Mudar quem paga numa compra só vale para ela; só este botão faz o app lembrar.
 */
export function setMerchantAlwaysSplit(
  rules: MerchantRules | undefined,
  tx: Pick<Transaction, "merchantKey" | "description">,
  split: Split | null,
  now = new Date().toISOString(),
): MerchantRules {
  const out = { ...rules };
  if (!tx.merchantKey || tx.merchantKey === "desconhecido") return out;
  const cur = out[tx.merchantKey];
  if (split && isSharedSplit(split)) {
    out[tx.merchantKey] = { ...cur, name: cur?.name ?? (tx.description.slice(0, 140) || tx.merchantKey), split, updatedAt: now };
  } else if (cur) {
    const { split: _drop, ...rest } = cur;
    void _drop;
    if (rest.category) out[tx.merchantKey] = { ...rest, updatedAt: now };
    else delete out[tx.merchantKey];
  }
  return out;
}

/** A loja está marcada para sempre dividir? */
export function alwaysSplitOf(rules: MerchantRules | undefined, merchantKey: string): Split | undefined {
  const s = rules?.[merchantKey]?.split;
  return isSharedSplit(s) ? s : undefined;
}

/**
 * Outras compras do mesmo fornecedor que ainda estavam com o valor antigo passam para o novo.
 * Devolve a lista nova e quantas mudaram (sem contar a própria compra editada).
 */
export function propagateToSameMerchant(
  txs: Transaction[],
  before: Transaction,
  after: Transaction,
  opts: { split?: boolean } = {},
): { transactions: Transaction[]; changed: number } {
  const catChanged = before.category !== after.category;
  // Quem paga não passa para as outras compras da loja (cada um paga a sua), a não ser que peçam.
  const splitChanged = opts.split === true && !sameSplit(before.split, after.split);
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

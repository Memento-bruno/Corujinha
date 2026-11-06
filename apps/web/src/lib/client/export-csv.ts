import { CATEGORIES } from "../domain/categories";
import type { HouseholdConfig, MonthKey, RecurringDebt, Transaction } from "../domain/types";
import { splitAmount } from "../engines/settlement";

const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const cell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function splitText(t: Pick<Transaction, "split">, cfg: HouseholdConfig): string {
  const a = cfg.users.USER_A.name;
  const b = cfg.users.USER_B.name;
  switch (t.split.type) {
    case "INDIVIDUAL_A":
      return `Só ${a}`;
    case "INDIVIDUAL_B":
      return `Só ${b}`;
    case "SHARED_CUSTOM":
      return `${t.split.percentA}/${100 - (t.split.percentA ?? 50)}`;
    default:
      return `Padrão ${cfg.defaultSplitPercentA}/${100 - cfg.defaultSplitPercentA}`;
  }
}

/**
 * Planilha do mês (CSV com ";" e vírgula decimal, abre direto no Excel e no Google Planilhas):
 * compras dos cartões e contas fora do cartão, com a parte de cada um.
 */
export function monthCsv(month: MonthKey, txs: Transaction[], debts: RecurringDebt[], cfg: HouseholdConfig): string {
  const a = cfg.users.USER_A.name;
  const b = cfg.users.USER_B.name;
  const head = ["Data", "Descrição", "Origem", "Pago por", "Categoria", "Divisão", "Parcela", "Valor", `Parte ${a}`, `Parte ${b}`];
  const cards = Object.fromEntries(cfg.cards.map((c) => [c.id, `${c.nickname} •${c.last4}`]));
  const rows: string[][] = [];
  for (const t of txs) {
    if (t.predictedFrom) continue;
    const s = splitAmount(t.amount, t.split, cfg.defaultSplitPercentA);
    rows.push([
      t.date.split("-").reverse().join("/"),
      t.description,
      cards[t.cardId] ?? "Cartão",
      cfg.users[t.paidBy].name,
      CATEGORIES[t.category]?.label ?? t.category,
      splitText(t, cfg),
      t.installment && t.installment.total > 1 ? `${t.installment.current}/${t.installment.total}` : "",
      money(t.amount),
      money(s.shareA),
      money(s.shareB),
    ]);
  }
  for (const x of debts) {
    const s = splitAmount(x.amount, x.split, cfg.defaultSplitPercentA);
    rows.push([
      `${String(x.dueDay).padStart(2, "0")}/${month.slice(5, 7)}/${month.slice(0, 4)}`,
      x.description,
      "Conta fora do cartão",
      cfg.users[x.paidBy].name,
      CATEGORIES[x.category]?.label ?? x.category,
      splitText(x, cfg),
      "",
      money(x.amount),
      money(s.shareA),
      money(s.shareB),
    ]);
  }
  return "﻿" + [head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}

export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const el = document.createElement("a");
  el.href = url;
  el.download = name;
  document.body.appendChild(el);
  el.click();
  el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

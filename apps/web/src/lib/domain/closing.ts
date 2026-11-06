/**
 * Modo fechamento: o casal escolhe uma data e tudo até ela fica fechado.
 *
 * - Compras até a data ficam travadas: ninguém edita, a sincronização do banco não mexe,
 *   a importação não grava por cima e nada é recalculado com elas.
 * - O app só olha dali em diante: totais, acerto, gráficos e revisão ignoram o que ficou fechado
 *   (é como se o acerto até essa data já tivesse sido feito). Nada é apagado do Drive.
 * - Parcela: a data da compra é a da compra original. A parcela que cai numa fatura de um mês
 *   DEPOIS do mês da data é cobrança nova e continua contando.
 * - Contas fora do cartão (boletos, contas fixas): valem as que vencem depois da data.
 */
import { addMonths, monthDiff } from "./months";
import type { ClosingCutoff, MonthKey, RecurringDebt, Transaction } from "./types";

export function cutoffMonth(c: ClosingCutoff): MonthKey {
  return c.date.slice(0, 7);
}

/** A compra (gravada na fatura de `billMonth`) ficou fechada? */
export function isLockedTx(t: Pick<Transaction, "date" | "installment">, billMonth: MonthKey, c: ClosingCutoff | undefined): boolean {
  if (!c) return false;
  if (t.installment && t.installment.current > 1) return billMonth <= cutoffMonth(c);
  return t.date <= c.date;
}

/** Só o que vale depois do fechamento. */
export function openTxs<T extends Pick<Transaction, "date" | "installment">>(txs: T[], billMonth: MonthKey, c: ClosingCutoff | undefined): T[] {
  if (!c) return txs;
  return txs.filter((t) => !isLockedTx(t, billMonth, c));
}

/**
 * Recorrentes como se começassem depois do fechamento (só para os cálculos; nunca gravar).
 * Uma conta que vence até o dia da data, no mês da data, ficou no fechamento.
 */
export function debtsAfterClosing(debts: RecurringDebt[], c: ClosingCutoff | undefined): RecurringDebt[] {
  if (!c) return debts;
  const cm = cutoffMonth(c);
  const day = Number(c.date.slice(8, 10));
  return debts.map((d) => {
    const first = d.dueDay <= day ? addMonths(cm, 1) : cm;
    if (d.startMonth >= first) return d;
    const skipped = monthDiff(d.startMonth, first);
    if (!d.totalInstallments) return { ...d, startMonth: first };
    const left = d.totalInstallments - skipped;
    return left > 0 ? { ...d, startMonth: first, totalInstallments: left } : { ...d, active: false };
  });
}

/**
 * Junta o que o cliente mandou com o que está gravado: as compras fechadas ficam exatamente
 * como estão no Drive (não somem nem mudam), o resto passa como veio.
 */
export function keepLockedTxs(stored: Transaction[], incoming: Transaction[], billMonth: MonthKey, c: ClosingCutoff | undefined): Transaction[] {
  if (!c) return incoming;
  const locked = stored.filter((t) => isLockedTx(t, billMonth, c));
  if (!locked.length) return incoming;
  const ids = new Set(locked.map((t) => t.id));
  return [...locked, ...incoming.filter((t) => !ids.has(t.id))].sort((a, b) => a.date.localeCompare(b.date));
}

const DATE = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/** "06/11/2026" */
export function closingLabel(c: Pick<ClosingCutoff, "date">): string {
  const [y, m, d] = c.date.split("-").map(Number);
  return DATE.format(new Date(Date.UTC(y, m - 1, d)));
}

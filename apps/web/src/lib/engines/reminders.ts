/**
 * Lembretes de vencimento por e-mail: o que vence hoje ou daqui a 3 dias e ainda não foi
 * marcado como pago. Regra simples, sem IA. O texto não leva valores (só nome e data),
 * para o e-mail não expor dinheiro.
 */
import type { HouseholdConfig, MonthKey, RecurringDebt, StatementFile, UserId } from "../domain/types";
import { isDebtActiveIn } from "./settlement";

export interface Reminder {
  title: string;
  /** "YYYY-MM-DD" */
  date: string;
  daysLeft: number;
}

/** Dias antes do vencimento em que o lembrete sai. */
export const REMIND_DAYS = [3, 0] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (dateIso: string, n: number) => iso(new Date(Date.parse(`${dateIso}T12:00:00Z`) + n * 86_400_000));

/**
 * `today` é a data de hoje no Brasil ("YYYY-MM-DD"). `statements` são os arquivos dos meses
 * que podem vencer nos próximos dias (este e o próximo).
 */
export function dueReminders(
  today: string,
  debts: RecurringDebt[],
  statements: Partial<Record<MonthKey, StatementFile>>,
  cfg: HouseholdConfig,
): Record<UserId, Reminder[]> {
  const out: Record<UserId, Reminder[]> = { USER_A: [], USER_B: [] };
  const targets = REMIND_DAYS.map((n) => ({ n, date: addDays(today, n) }));
  const marks = new Set(cfg.paidCardBills ?? []);
  for (const { n, date } of targets) {
    const month = date.slice(0, 7);
    const day = Number(date.slice(8, 10));
    const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    for (const x of debts) {
      if (x.kind === "CARTAO" || !isDebtActiveIn(x, month)) continue;
      if (Math.min(x.dueDay, lastDay) !== day || x.paidMonths?.includes(month)) continue;
      out[x.paidBy].push({ title: x.description, date, daysLeft: n });
    }
    for (const [cardId, b] of Object.entries(statements[month]?.bankBills ?? {})) {
      const card = cfg.cards.find((c) => c.id === cardId);
      if (!card || b.dueDate !== date || b.total <= 0 || b.status === "paga" || marks.has(`${cardId}|${month}`)) continue;
      out[card.owner].push({ title: `Fatura ${card.nickname}`, date, daysLeft: n });
    }
  }
  for (const u of ["USER_A", "USER_B"] as UserId[]) out[u].sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** Texto do e-mail (sem valores). */
export function reminderEmail(name: string, items: Reminder[], appUrl: string): { subject: string; text: string; html: string } {
  const when = (r: Reminder) => (r.daysLeft === 0 ? "vence hoje" : `vence em ${r.daysLeft} dias`);
  const br = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
  const lines = items.map((r) => `• ${r.title}: ${when(r)} (${br(r.date)})`);
  const subject = items.length === 1 ? `Corujinha: ${items[0].title} ${when(items[0])}` : `Corujinha: ${items.length} contas vencendo`;
  const text = `Oi, ${name}!\n\n${lines.join("\n")}\n\nJá pagou? Marque "Já paguei" no app: ${appUrl}\n\nPara não receber mais, desligue em Configurações → Contas e vencimentos.`;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html =
    `<p>Oi, ${esc(name)}!</p><ul>${items.map((r) => `<li><b>${esc(r.title)}</b>: ${when(r)} (${br(r.date)})</li>`).join("")}</ul>` +
    `<p>Já pagou? Marque <b>Já paguei</b> no <a href="${esc(appUrl)}">app</a>.</p>` +
    `<p style="color:#888;font-size:12px">Para não receber mais, desligue em Configurações → Contas e vencimentos.</p>`;
  return { subject, text, html };
}

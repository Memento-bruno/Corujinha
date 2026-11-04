import { parseMoneyToCents } from "../domain/money";
import { cleanDescription, parseDate, parseInstallment } from "./normalize";
import { isInvoicePayment, type ParseResult } from "./types";

/**
 * Extrai lançamentos do TEXTO de uma fatura em PDF. Cada banco tem um layout,
 * então usamos uma heurística de linha: "DD/MM [descrição] [valor]".
 * Funciona bem para Nubank, Itaú, Inter, C6 e Santander na maioria dos casos;
 * o usuário revisa a prévia antes de importar.
 */
export function parsePdfText(text: string, fallbackYear: number): ParseResult {
  const result: ParseResult = { format: "pdf", rows: [], skipped: [], warnings: [] };
  const months: Record<string, string> = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
  };
  const lineRe =
    /^\s*(\d{1,2}[/.](?:\d{1,2}|[a-z]{3})(?:[/.]\d{2,4})?|\d{1,2}\s+(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez))\s+(.+?)\s+(-?\s?(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})*,\d{2}-?)\s*$/i;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const m = line.match(lineRe);
    if (!m) continue;
    let dateStr = m[1].toLowerCase();
    const named = dateStr.match(/^(\d{1,2})[\s/.]+([a-z]{3})/);
    if (named && months[named[2]]) dateStr = `${named[1]}/${months[named[2]]}`;
    const date = parseDate(dateStr, fallbackYear);
    const amount = parseMoneyToCents(m[3]);
    const desc = m[2].trim();
    if (!date || amount === null) continue;
    if (isInvoicePayment(desc)) {
      result.skipped.push({ line, reason: "Pagamento de fatura (ignorado)" });
      continue;
    }
    result.rows.push({ date, description: cleanDescription(desc), amount, installment: parseInstallment(desc) });
  }
  if (result.rows.length === 0) {
    result.warnings.push(
      "Não reconheci lançamentos neste PDF. Se for uma fatura escaneada (imagem), exporte em CSV/OFX pelo app do banco.",
    );
  }
  return result;
}

import { parseMoneyToCents } from "../domain/money";
import { cleanDescription, parseDate, parseInstallment } from "./normalize";
import { isInvoicePayment, type ParseResult } from "./types";

function tag(block: string, name: string): string | null {
  // OFX 1.x (SGML, sem fechamento) e 2.x (XML) são aceitos
  const re = new RegExp(`<${name}>([^<\\r\\n]*)`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Lê OFX de cartão de crédito (CREDITCARDMSGSRSV1) ou conta. No OFX, débitos (gastos)
 * vêm negativos; no app, gasto é positivo, então invertemos o sinal.
 */
export function parseOfx(text: string): ParseResult {
  const result: ParseResult = { format: "ofx", rows: [], skipped: [], warnings: [] };
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  if (blocks.length === 0) {
    result.warnings.push("Nenhuma transação <STMTTRN> encontrada no arquivo OFX.");
    return result;
  }
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const date = parseDate(tag(block, "DTPOSTED") ?? "");
    const desc = tag(block, "MEMO") || tag(block, "NAME") || "";
    const amt = parseMoneyToCents(tag(block, "TRNAMT") ?? "");
    if (!date || !desc || amt === null) {
      result.skipped.push({ line: block.slice(0, 120), reason: "Transação incompleta" });
      continue;
    }
    if (isInvoicePayment(desc)) {
      result.skipped.push({ line: desc, reason: "Pagamento de fatura (ignorado)" });
      continue;
    }
    result.rows.push({
      date,
      description: cleanDescription(desc),
      amount: -amt,
      installment: parseInstallment(desc),
    });
  }
  return result;
}

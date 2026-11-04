import Papa from "papaparse";
import { parseMoneyToCents } from "../domain/money";
import { cleanDescription, parseDate, parseInstallment } from "./normalize";
import { isInvoicePayment, type ParseResult, type ParsedRow } from "./types";

const DATE_HEADERS = ["date", "data", "data compra", "data da compra", "data lançamento", "data lancamento", "dt"];
const DESC_HEADERS = ["title", "descrição", "descricao", "description", "estabelecimento", "lançamento", "lancamento", "histórico", "historico", "memo"];
const AMOUNT_HEADERS = ["amount", "valor", "valor (r$)", "valor r$", "value", "valor em r$"];

function findCol(headers: string[], candidates: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase());
  for (const c of candidates) {
    const i = norm.indexOf(c);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const i = norm.findIndex((h) => h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Lê CSV de fatura de cartão. Reconhece cabeçalhos comuns (Nubank: date,title,amount;
 * Itaú/Inter/C6: data;lançamento;valor). Separador "," ou ";" detectado automaticamente.
 * Convenção: valores positivos são gastos. Use `invertSign` se o banco exporta gastos negativos.
 */
export function parseCsv(text: string, opts: { invertSign?: boolean; fallbackYear?: number } = {}): ParseResult {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true });
  const rows = parsed.data;
  const result: ParseResult = { format: "csv", rows: [], skipped: [], warnings: [] };
  if (rows.length < 2) {
    result.warnings.push("Arquivo CSV vazio ou sem cabeçalho.");
    return result;
  }
  const header = rows[0];
  const iDate = findCol(header, DATE_HEADERS);
  const iDesc = findCol(header, DESC_HEADERS);
  const iAmount = findCol(header, AMOUNT_HEADERS);
  if (iDate < 0 || iDesc < 0 || iAmount < 0) {
    result.warnings.push(
      "Não encontrei as colunas de data, descrição e valor. Cabeçalhos aceitos: data/date, descrição/title, valor/amount.",
    );
    return result;
  }

  const out: ParsedRow[] = [];
  for (const r of rows.slice(1)) {
    const line = r.join(" | ");
    const date = parseDate(r[iDate] ?? "", opts.fallbackYear);
    const rawDesc = (r[iDesc] ?? "").trim();
    let amount = parseMoneyToCents(r[iAmount] ?? "");
    if (!date || !rawDesc || amount === null) {
      result.skipped.push({ line, reason: "Linha não reconhecida" });
      continue;
    }
    if (isInvoicePayment(rawDesc)) {
      result.skipped.push({ line, reason: "Pagamento de fatura (ignorado)" });
      continue;
    }
    if (opts.invertSign) amount = -amount;
    out.push({ date, description: cleanDescription(rawDesc), amount, installment: parseInstallment(rawDesc) });
  }

  // Heurística: se quase tudo é negativo, o banco exporta gastos como negativos.
  const negatives = out.filter((r) => r.amount < 0).length;
  if (!opts.invertSign && out.length >= 3 && negatives / out.length > 0.7) {
    for (const r of out) r.amount = -r.amount;
    result.warnings.push("Os gastos vieram com sinal negativo; inverti os sinais automaticamente.");
  }
  result.rows = out;
  return result;
}

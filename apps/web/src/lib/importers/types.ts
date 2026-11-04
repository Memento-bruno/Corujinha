import type { Cents, Installment } from "../domain/types";

export interface ParsedRow {
  date: string; // ISO
  description: string;
  /** Positivo = gasto, negativo = estorno. Já no sinal do app. */
  amount: Cents;
  installment?: Installment;
}

export interface ParseResult {
  format: "csv" | "ofx" | "pdf";
  rows: ParsedRow[];
  /** Linhas ignoradas (ex.: pagamento da fatura) ou não reconhecidas. */
  skipped: { line: string; reason: string }[];
  warnings: string[];
}

/** Pagamento da própria fatura não é gasto: ignoramos para não contar duas vezes. */
export function isInvoicePayment(description: string): boolean {
  return /pagamento (recebido|efetuado|de fatura|fatura)|pgto fatura|pagto debito|pagamento online/i.test(description);
}

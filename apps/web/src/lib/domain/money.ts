import type { Cents } from "./types";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_COMPACT = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const PCT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 });

export function formatBRL(cents: Cents, compact = false): string {
  return (compact ? BRL_COMPACT : BRL).format(cents / 100);
}

/**
 * Valor em 10³ com 2 casas decimais: R$ 2.536,83 => "R$ 2,54×10³".
 * Abaixo de R$ 1.000 fica o valor normal (R$ 89,90).
 */
export function formatSci(cents: Cents): string {
  const reais = cents / 100;
  if (Math.abs(reais) < 1000) return formatBRL(cents);
  const s = `R$ ${(Math.abs(reais) / 1000).toFixed(2).replace(".", ",")}×10³`;
  return reais < 0 ? `-${s}` : s;
}

/** Formata um percentual já calculado (ex.: 12.345 => "12,3%"). */
export function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${PCT.format(value)}%`;
}

/** Percentual de `part` sobre `base`, seguro para base zero. */
export function pctOf(part: number, base: number): number {
  if (!base) return 0;
  return (part / base) * 100;
}

/**
 * Converte texto monetário brasileiro ou internacional em centavos.
 * Aceita "1.234,56", "1234.56", "-R$ 12,30", "12,30-", "(12,30)".
 */
export function parseMoneyToCents(raw: string): Cents | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/R\$|\s|BRL/gi, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // "1.234" sem vírgula e com 3 casas depois do ponto = milhar brasileiro
    const decimals = s.length - lastDot - 1;
    normalized = lastComma === -1 && decimals === 3 && s.split(".").length >= 2
      ? s.replace(/\./g, "")
      : s.replace(/,/g, "");
  } else {
    normalized = s;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

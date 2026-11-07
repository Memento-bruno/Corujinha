import type { MonthKey } from "./types";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(v: unknown): v is MonthKey {
  return typeof v === "string" && MONTH_RE.test(v);
}

export function monthOf(date: Date): MonthKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const BR_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });

/** Dia de hoje no horário de Brasília ("YYYY-MM-DD"). Servidor e celular usam o mesmo relógio. */
export function todayBR(now: Date = new Date()): string {
  return BR_DAY.format(now);
}

/** Mês de hoje no horário de Brasília. */
export function currentMonthBR(now: Date = new Date()): MonthKey {
  return todayBR(now).slice(0, 7);
}

/** Soma dias a uma data "YYYY-MM-DD". */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Diferença em meses: b - a. */
export function monthDiff(a: MonthKey, b: MonthKey): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return by * 12 + bm - (ay * 12 + am);
}

/** Lista de `count` meses terminando em `end` (inclusive), do mais antigo ao mais novo. */
export function monthRange(end: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - count + 1));
}

const LONG = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

function toDate(month: MonthKey): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15));
}

export function monthLabel(month: MonthKey): string {
  const s = LONG.format(toDate(month)).replace(" de ", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function monthShort(month: MonthKey): string {
  const s = SHORT.format(toDate(month)).replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const NAME = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

/** Só o nome do mês, em minúsculas (ex.: "janeiro"). */
export function monthName(month: MonthKey): string {
  return NAME.format(toDate(month));
}

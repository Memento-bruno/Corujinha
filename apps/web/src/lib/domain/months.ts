import type { MonthKey } from "./types";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(v: unknown): v is MonthKey {
  return typeof v === "string" && MONTH_RE.test(v);
}

export function monthOf(date: Date): MonthKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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

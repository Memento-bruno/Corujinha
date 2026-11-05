"use client";

import { useDerived } from "@/lib/client/derived";
import { GROW, useReveal } from "@/lib/client/use-reveal";
import { formatPct } from "@/lib/domain/money";
import { monthName } from "@/lib/domain/months";
import type { FinancialHealth } from "@/lib/engines/overview";

const CHIP: Record<FinancialHealth["label"], string> = {
  Excelente: "bg-green-100 text-green-800",
  Boa: "bg-green-100 text-green-800",
  Atenção: "bg-yellow-100 text-yellow-800",
  Crítica: "bg-red-100 text-red-800",
};

/** Cor da barra pelo quanto o fator tira de pontos (25 = ótimo). */
function barColor(points: number): string {
  if (points >= 20) return "#22c55e";
  if (points >= 12) return "#eab308";
  if (points >= 6) return "#f97316";
  return "#dc2626";
}

const WORST_TEXT: Record<string, string> = {
  renda: "O que mais pesa é a renda usada no mês.",
  meta: "O que mais pesa é a meta do mês.",
  parcelas: "O que mais pesa são as parcelas.",
  contas: "O que mais pesa são contas ainda não pagas.",
};

/** Índice de saúde financeira de 0 a 100, por 4 regras simples (sem IA). */
export function HealthCard() {
  const d = useDerived();
  const h = d.finHealth;
  const prev = d.prevFinHealth;
  const diff = prev ? h.score - prev.score : null;
  const C = 2 * Math.PI * 46;
  const [ref, shown] = useReveal<HTMLElement>();
  const trend =
    diff === null ? "" : diff === 0 ? `Igual a ${monthName(d.prevMonth)}.` : `${diff > 0 ? "Subiu" : "Caiu"} ${Math.abs(diff)} ponto${Math.abs(diff) === 1 ? "" : "s"} desde ${monthName(d.prevMonth)}.`;
  return (
    <section ref={ref} aria-labelledby="saude-title" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 rounded-3xl border border-[#ebebef] bg-white p-4 sm:p-6">
      <div>
        <h2 id="saude-title" className="text-base font-bold">Saúde financeira</h2>
        <p className="mt-1 text-[13px] text-zinc-600">Nota de 0 a 100, calculada por regras simples</p>
      </div>
      <div className="flex items-center gap-[18px]">
        <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`Índice de saúde financeira: ${h.score} de 100, ${h.label}`} className="shrink-0">
          <defs>
            <linearGradient id="hRing" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#22c55e" />
              <stop offset=".6" stopColor="#eab308" />
              <stop offset="1" stopColor="#f97316" />
            </linearGradient>
          </defs>
          <circle cx="56" cy="56" r="46" fill="none" stroke="#eeeef2" strokeWidth="12" />
          <circle
            cx="56"
            cy="56"
            r="46"
            fill="none"
            stroke="url(#hRing)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${shown ? (h.score / 100) * C : 0} ${C}`}
            className="motion-reduce:transition-none"
            style={{ transition: "stroke-dasharray 1s cubic-bezier(.3,0,.2,1)" }}
            transform="rotate(-90 56 56)"
          />
          <text x="56" y="60" textAnchor="middle" fontSize="30" fontWeight="800" fill="#18181b">{h.score}</text>
          <text x="56" y="78" textAnchor="middle" fontSize="11" fontWeight="600" fill="#71717a">de 100</text>
        </svg>
        <div className="flex flex-col gap-1.5">
          <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-bold ${CHIP[h.label]}`}>{h.label}</span>
          <p className="text-[13px] leading-relaxed text-zinc-700">
            {trend} {h.worst ? WORST_TEXT[h.worst.key] : "Tudo dentro do esperado."}
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-2.5">
        {h.factors.map((f, i) => (
          <li key={f.key}>
            <div className="flex justify-between text-[13px]">
              <span>{f.label}</span>
              <b>{formatPct(Math.round(f.value))}</b>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#eeeef2]">
              <div
                className={`h-full rounded-full ${GROW}`}
                style={{ width: shown ? `${Math.min(100, f.value)}%` : "0%", background: barColor(f.points), transitionDelay: `${200 + i * 100}ms` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {!d.income.totalIncome && (
        <p className="text-xs text-zinc-500">Com os salários em Configurações, a nota também considera a renda.</p>
      )}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useStore } from "@/lib/client/store";
import { GROW, useReveal } from "@/lib/client/use-reveal";
import { formatPct } from "@/lib/domain/money";
import { monthName } from "@/lib/domain/months";
import { USERS, type UserId } from "@/lib/domain/types";
import { billStatus } from "../shell/month-switcher";
import { PERSON } from "./colors";
import { Speedometer } from "./speedometer";

const first = (name: string) => name.split(" ")[0];
const pctText = (v: number | null) => (v === null ? "–" : formatPct(Math.round(v)));

/** Cartão principal: gastos do mês, de quem são, quanto da renda usam, quem deve a quem e a meta. */
export function SpendHero() {
  const { state } = useStore();
  const d = useDerived();
  const fmt = useFmt(d.spend.total);
  const { spend, settlement, income, users } = d;
  const total = spend.total;
  const status = spend.forecast ? { label: "Previsto", tone: "bg-zinc-100 text-zinc-700" } : billStatus(state!.statements[d.month]?.data, d.month);
  const share = (u: UserId) => (total > 0 ? (settlement.fairShare[u] / total) * 100 : 50);
  const goal = d.config.monthlyGoal;
  const ratio = goal > 0 ? total / goal : 0;
  const goalChip =
    ratio > 1
      ? { label: "Passou da meta", tone: "bg-red-100 text-red-800" }
      : ratio >= 0.8
        ? { label: "Perto do limite", tone: "bg-orange-100 text-orange-800" }
        : { label: "Tranquilo", tone: "bg-green-100 text-green-800" };
  const left = goal - total;
  const t = settlement.transfer;
  const [ref, shown] = useReveal<HTMLElement>();

  return (
    <section ref={ref} aria-labelledby="gastos-title" className="flex flex-wrap items-stretch gap-5 rounded-3xl border border-[#ebebef] bg-white p-4 sm:gap-8 sm:p-6">
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 id="gastos-title" className="text-base font-bold text-zinc-900 sm:text-lg">
            Gastos de {monthName(d.month)}
          </h1>
          {status && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.tone}`}>{status.label}</span>}
        </div>
        <div className="tabular text-[32px] leading-tight font-extrabold tracking-tight text-zinc-900 sm:text-5xl">{fmt.privacy ? fmt.money(total, goal) : fmt.money(total)}</div>
        {fmt.privacy && <p className="-mt-2 text-xs text-zinc-500">da meta do mês</p>}
        <p className="-mt-1.5 text-[13px] text-zinc-700 sm:text-sm">
          Fatura do cartão <b>{fmt.money(spend.card)}</b> + contas e boletos <b>{fmt.money(spend.bills)}</b>
        </p>

        <div>
          <div className="mb-2 text-[13px] font-semibold text-zinc-600">Onde estão os gastos?</div>
          <div
            className="flex h-7 overflow-hidden rounded-[10px] text-[13px] font-bold"
            role="img"
            aria-label={USERS.map((u) => `${first(users[u].name)} ${Math.round(share(u))} por cento`).join(", ")}
          >
            {USERS.map((u, i) => (
              <div
                key={u}
                className={`flex items-center overflow-hidden whitespace-nowrap ${i ? "justify-end pr-2.5" : "pl-2.5"} ${GROW}`}
                style={{ width: shown ? `${share(u)}%` : i ? "100%" : "0%", background: PERSON[u].bg, color: PERSON[u].fg }}
              >
                {share(u) >= 12 && formatPct(Math.round(share(u)))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between gap-3 text-[13px] sm:text-sm">
            {USERS.map((u) => (
              <span key={u} className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: PERSON[u].bg }} aria-hidden />
                {first(users[u].name)} <b className="tabular">{fmt.money(settlement.fairShare[u])}</b>
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-[#F4F5F7] p-3.5 sm:p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold text-zinc-600">Quanto da renda os gastos usam</span>
            <span className="tabular text-[22px] font-extrabold">{pctText(income.couple)}</span>
          </div>
          {income.couple === null ? (
            <p className="mt-2 text-[13px] text-zinc-700">
              Coloque os salários em{" "}
              <Link href="/configuracoes#renda" className="font-semibold text-[#4f52d6] underline">
                Configurações
              </Link>{" "}
              para ver esta conta. O valor fica escondido, só a porcentagem aparece.
            </p>
          ) : (
            <>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-200" role="img" aria-label={`${Math.round(income.couple)} por cento da renda do casal`}>
                <div className={`h-full rounded-full bg-zinc-900 ${GROW}`} style={{ width: shown ? `${Math.min(100, income.couple)}%` : "0%" }} />
              </div>
              <div className="mt-2.5 flex justify-between gap-3 text-[13px] text-zinc-700">
                {USERS.map((u) => (
                  <span key={u}>
                    {first(users[u].name)}: <b>{pctText(income.perUser[u])}</b> da própria renda
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 rounded-[20px] bg-[#F4F5F7] px-3.5 py-3 sm:px-[18px] sm:py-4">
          <h2 className="w-full text-[13px] font-semibold text-zinc-600">Quem deve a quem</h2>
          {t ? (
            <>
              <Dot u={t.from} name={users[t.from].name} />
              <svg width="28" height="12" viewBox="0 0 40 16" aria-hidden className="shrink-0">
                <path d="M2 8 H36 M30 2 L37 8 L30 14" fill="none" stroke="#18181b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <Dot u={t.to} name={users[t.to].name} />
              <p className="flex-auto text-[13px] leading-snug sm:text-sm">
                {first(users[t.from].name)} deve para {first(users[t.to].name)}{" "}
                <b className="tabular text-base whitespace-nowrap sm:text-lg">{fmt.money(t.amount)}</b>
              </p>
            </>
          ) : (
            <p className="flex-auto text-sm">Ninguém deve nada neste mês.</p>
          )}
          <Link href="/acerto" className="text-[13px] font-semibold text-[#4f52d6]">
            Detalhes
          </Link>
        </div>

        <div className="flex flex-auto flex-col gap-2 rounded-[20px] bg-[#F4F5F7] px-3.5 py-3 sm:px-[18px] sm:py-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold text-zinc-600">Meta de gastos do mês</h2>
            {goal > 0 && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${goalChip.tone}`}>{goalChip.label}</span>}
          </div>
          {goal > 0 ? (
            <div className="flex flex-auto items-center gap-3 sm:gap-5">
              <div className="min-w-0 max-w-[280px] flex-[1.2_1_0]">
                <Speedometer shown={shown} ratio={ratio} label={`Velocímetro: ${Math.round(ratio * 100)} por cento da meta usada`} />
              </div>
              <div className="flex min-w-0 flex-[1_1_0] flex-col gap-1.5 sm:gap-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[28px] leading-none font-extrabold sm:text-[40px]">{formatPct(Math.round(ratio * 100))}</span>
                  <span className="text-[13px] text-zinc-600">da meta</span>
                </div>
                <Row label="Gasto" value={fmt.money(total, goal)} />
                <Row label="Meta" value={fmt.money(goal, goal)} />
                <Row
                  label={left >= 0 ? "Ainda pode" : "Passou"}
                  value={fmt.money(Math.abs(left), goal)}
                  tone={left >= 0 ? "text-green-700" : "text-red-700"}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-700">
              Defina a meta do mês em{" "}
              <Link href="/configuracoes" className="font-semibold text-[#4f52d6] underline">
                Configurações
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Dot({ u, name }: { u: UserId; name: string }) {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold"
      style={{ background: PERSON[u].bg, color: PERSON[u].fg }}
      aria-hidden
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}

function Row({ label, value, tone = "text-zinc-900" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-2 text-[13px] text-zinc-600 sm:text-sm">
      <span>{label}</span>
      <b className={`tabular ${tone}`}>{value}</b>
    </div>
  );
}

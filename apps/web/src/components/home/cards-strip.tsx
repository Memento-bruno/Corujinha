"use client";

import Link from "next/link";
import { useDerived, useFmt } from "@/lib/client/derived";
import { useReveal } from "@/lib/client/use-reveal";
import { sumCents } from "@/lib/engines/analytics";
import { CreditCardVisual } from "./credit-card";

/** Cartões do casal com a fatura de cada um no mês (só os 4 últimos dígitos). */
export function CardsStrip() {
  const d = useDerived();
  const fmt = useFmt(d.spend.card);
  const [ref, shown] = useReveal<HTMLElement>();
  // Do cartão que mais gastou para o que menos gastou.
  const cards = d.config.cards
    .map((c) => ({ c, total: sumCents(d.allTxs.filter((t) => t.cardId === c.id)) }))
    .sort((a, b) => b.total - a.total);
  const top = Math.max(1, cards[0]?.total ?? 1);
  return (
    <section ref={ref} aria-labelledby="cards-title" className="rounded-3xl border border-[#ebebef] bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="cards-title" className="text-lg font-bold">Gasto por cartão</h2>
          <p className="mt-1 text-sm text-zinc-600">Do cartão que mais gastou para o que menos gastou</p>
        </div>
        <Link href="/configuracoes#cartoes" className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border border-zinc-300 bg-white px-3.5 text-sm font-semibold">
          + Cartão
        </Link>
      </div>
      {cards.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">Nenhum cartão cadastrado. Adicione em Configurações.</p>
      ) : (
        <div className="no-scrollbar -mx-5 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          {cards.map(({ c, total }, i) => (
            <div
              key={c.id}
              className="w-[78%] shrink-0 snap-start transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none sm:w-[300px]"
              style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(12px)", transitionDelay: `${i * 90}ms` }}
            >
              <div className="relative">
                <CreditCardVisual card={c} ownerName={d.users[c.owner].name.split(" ")[0]} />
                <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-extrabold text-white">{i + 1}º</span>
              </div>
              <div className="mt-2.5 flex items-center justify-between px-1 text-sm">
                <span className="text-zinc-600">Fatura do mês</span>
                <span className="tabular font-bold">{fmt.money(total)}</span>
              </div>
              <div className="mx-1 mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-[#4f52d6] transition-[width] duration-700 ease-out motion-reduce:transition-none"
                  style={{ width: shown ? `${(total / top) * 100}%` : "0%", transitionDelay: `${200 + i * 90}ms` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

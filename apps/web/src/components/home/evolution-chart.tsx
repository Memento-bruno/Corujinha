"use client";

import { useReveal } from "@/lib/client/use-reveal";
import { useDerived, useFmt } from "@/lib/client/derived";
import { monthName, monthShort } from "@/lib/domain/months";

/** Teto "redondo" do eixo: 1, 2, 2,5 ou 5 × potência de 10. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Curva suave (Catmull-Rom → Bézier) passando por todos os pontos. */
function smooth(pts: [number, number][]): string {
  if (!pts.length) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

/** Linha dos gastos (cartão + contas): 4 meses antes, o mês aberto e 4 depois; previsão tracejada. */
export function EvolutionChart() {
  const d = useDerived();
  const fmt = useFmt(d.spend.total);
  const data = d.timeline;
  const max = niceMax(Math.max(...data.map((m) => m.total)) * 1.15);
  const n = data.length;
  const xs = data.map((_, i) => 7 + (i * 89) / (n - 1));
  const ys = data.map((m) => 100 - (m.total / max) * 100);
  const pts = data.map((_, i) => [xs[i], ys[i]] as [number, number]);
  const lastReal = data.findLastIndex((m) => !m.forecast);
  const past = pts.slice(0, lastReal + 1);
  const fut = lastReal >= 0 ? pts.slice(lastReal) : pts;
  const area = (p: [number, number][]) => (p.length > 1 ? `${smooth(p)} L${p.at(-1)![0]},100 L${p[0][0]},100 Z` : "");
  const zoneLeft = lastReal >= 0 && lastReal < n - 1 ? (xs[lastReal] + xs[lastReal + 1]) / 2 : null;
  const ticks = [0.25, 0.5, 0.75, 1].map((f) => f * max);
  const [ref, shown] = useReveal<HTMLElement>();
  // A linha "se desenha" da esquerda para a direita; pontos e rótulos aparecem quando a linha chega neles.
  const DRAW_MS = 1100;

  return (
    <section ref={ref} className="flex min-w-0 flex-[2_1_520px] flex-col rounded-3xl border border-[#ebebef] bg-white p-4 sm:p-6" aria-labelledby="evo-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="evo-title" className="text-base font-bold">Evolução dos gastos</h2>
        <div className="flex gap-3.5 text-xs text-zinc-700">
          <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded bg-[#4f52d6]" aria-hidden />Real</span>
          <span className="flex items-center gap-1.5"><span className="w-4 border-t-[3px] border-dotted border-[#8b8ff5]" aria-hidden />Prevista</span>
        </div>
      </div>
      <div
        className="relative mt-7 min-h-[240px] flex-auto"
        role="img"
        aria-label={`Gastos por mês: ${data.map((m) => `${monthName(m.month)} ${fmt.money(m.total)}${m.forecast ? " previsto" : ""}`).join(", ")}`}
      >
        {zoneLeft !== null && (
          <div className="absolute inset-y-0 right-0 rounded-xl bg-[#4f52d6]/[.05]" style={{ left: `${zoneLeft}%` }} aria-hidden>
            <span className="absolute -top-5 left-2.5 text-[11px] font-bold tracking-wide text-[#4f52d6] uppercase">Previsto</span>
          </div>
        )}
        {ticks.map((t) => (
          <div key={t} aria-hidden>
            <span className="absolute inset-x-0 border-t border-dashed border-zinc-200" style={{ top: `${100 - (t / max) * 100}%` }} />
            {!fmt.privacy && (
              <span className="absolute left-0 -translate-y-full pb-0.5 text-[10px] font-semibold text-zinc-400" style={{ top: `${100 - (t / max) * 100}%` }}>
                {fmt.num(t)}
              </span>
            )}
          </div>
        ))}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible motion-reduce:transition-none"
          style={{ clipPath: shown ? "inset(-10% -2% -10% -2%)" : "inset(-10% 102% -10% -2%)", transition: `clip-path ${DRAW_MS}ms cubic-bezier(.4,0,.2,1)` }}
          aria-hidden
        >
          <defs>
            <linearGradient id="evoFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f52d6" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#4f52d6" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="evoFillFc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f52d6" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#4f52d6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area(past)} fill="url(#evoFill)" />
          <path d={area(fut)} fill="url(#evoFillFc)" />
          <path d={smooth(past)} fill="none" stroke="#4f52d6" strokeWidth="3.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={smooth(fut)} fill="none" stroke="#8b8ff5" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {data.map((m, i) => {
          const sel = m.month === d.month;
          return (
            <div
              key={m.month}
              aria-hidden
              className="motion-reduce:transition-none"
              style={{ opacity: shown ? 1 : 0, transition: "opacity .25s ease-out", transitionDelay: `${(xs[i] / 100) * DRAW_MS}ms` }}
            >
              <span
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-white"
                style={{ left: `${xs[i]}%`, top: `${ys[i]}%`, borderColor: m.forecast ? "#8b8ff5" : "#4f52d6", ...(sel ? { width: 16, height: 16, background: "#4f52d6" } : {}) }}
              />
              <span
                className={`tabular absolute -translate-x-1/2 -translate-y-[calc(100%+10px)] text-[10px] font-bold whitespace-nowrap sm:text-[11px] ${m.forecast ? "text-zinc-500" : "text-zinc-900"} ${i % 2 && !sel ? "hidden sm:block" : ""}`}
                style={{ left: `${xs[i]}%`, top: `${ys[i]}%` }}
              >
                {fmt.num(m.total)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="relative mt-2.5 h-5">
        {data.map((m, i) => (
          <span
            key={m.month}
            className={`absolute -translate-x-1/2 text-xs ${m.month === d.month ? "font-extrabold text-zinc-900" : "font-semibold text-zinc-500"}`}
            style={{ left: `${xs[i]}%` }}
          >
            {monthShort(m.month)}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-zinc-700">
        Cartão + contas e boletos. Previsto = parcelas que já existem + contas fixas cadastradas (aluguel, condomínio etc.).
      </p>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Tela de carregamento em forma de joguinho, toda dentro de um círculo:
 * gramado, montanhas, cofrinhos de porquinho e moedas de $ que dá para tocar e arremessar.
 * A barra de progresso é o sol: ele desce pelo céu e, quando tudo carregou, vira noite.
 * Fora do círculo o fundo é branco ou preto conforme o tema do celular.
 */

const SIZE = 300;
const C = SIZE / 2;
const COIN_R = 11;
const GROUND = 266;
const GRAVITY = 900;
const MAX_COINS = 8;
const MIN_SHOW_MS = 1600;

interface Coin {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  spinV: number;
  born: number;
}

interface Pig {
  x: number;
  y: number;
  flip: boolean;
  jumpAt: number;
  eatAt: number;
}

interface Pop {
  id: number;
  x: number;
  y: number;
  at: number;
}

// ---------- cores do céu ao longo do "dia" ----------
type Stop = [number, string, string];
const SKY: Stop[] = [
  [0, "#6bbdf2", "#d4f0ff"],
  [0.5, "#7cc0f0", "#e6f4ff"],
  [0.7, "#f29a8a", "#ffd39a"],
  [0.86, "#5a4a8c", "#e9847a"],
  [1, "#121838", "#34336a"],
];

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  const f = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${f(r1, r2)},${f(g1, g2)},${f(b1, b2)})`;
}
function sky(p: number): [string, string] {
  for (let i = 1; i < SKY.length; i++) {
    const [p0, t0, b0] = SKY[i - 1];
    const [p1, t1, b1] = SKY[i];
    if (p <= p1) {
      const t = (p - p0) / (p1 - p0);
      return [mix(t0, t1, t), mix(b0, b1, t)];
    }
  }
  return [SKY.at(-1)![1], SKY.at(-1)![2]];
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Caminho do sol: começa alto à esquerda e se põe atrás das montanhas à direita. */
function sunAt(p: number) {
  return { x: 62 + 186 * p, y: 62 + 168 * p * p };
}
const SUN_TRACK = Array.from({ length: 41 }, (_, i) => {
  const s = sunAt(i / 40);
  return `${i ? "L" : "M"}${s.x.toFixed(1)},${s.y.toFixed(1)}`;
}).join(" ");

const STARS = [
  [48, 120, 1.2], [70, 40, 1], [96, 98, 1.4], [120, 30, 1], [140, 76, 1.1], [168, 46, 1.5],
  [192, 92, 1], [214, 34, 1.2], [236, 70, 1], [258, 110, 1.3], [110, 128, 0.9], [182, 118, 1],
] as const;

export function LoadingScreen({
  ready,
  slow,
  zoom = 1,
  message,
  onDone,
}: {
  /** Dados carregados: o sol termina de se pôr e a tela some. */
  ready: boolean;
  /** Carregamento demorado (primeira busca no banco): o sol anda mais devagar. */
  slow?: boolean;
  message: string;
  onDone: () => void;
  /** Zoom das telas encolhidas no celular: a tela de carregamento continua no tamanho do celular. */
  zoom?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const coins = useRef<Coin[]>([]);
  const pigs = useRef<Pig[]>([
    { x: 96, y: 254, flip: false, jumpAt: -9, eatAt: -9 },
    { x: 206, y: 258, flip: true, jumpAt: -9, eatAt: -9 },
  ]);
  const pops = useRef<Pop[]>([]);
  const drag = useRef<{ id: number; dx: number; dy: number; trail: { x: number; y: number; t: number }[]; start: number; moved: number } | null>(
    null,
  );
  const progress = useRef(0);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const slowRef = useRef(!!slow);
  slowRef.current = !!slow;
  const nextId = useRef(1);
  const [, setFrame] = useState(0);
  const [saved, setSaved] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const now = useRef(0);

  const spawn = useCallback((x: number, y: number, vx: number, vy: number) => {
    if (coins.current.length >= MAX_COINS) coins.current.shift();
    coins.current.push({ id: nextId.current++, x, y, vx, vy, spin: Math.random() * 6, spinV: 6 + Math.random() * 6, born: now.current });
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    for (let i = 0; i < 3; i++) spawn(110 + i * 40, 70 + i * 22, (Math.random() - 0.5) * 60, 0);
    const startedAt = performance.now();
    let last = startedAt;
    let lastRain = 0;
    let doneAt = 0;
    let raf = 0;
    let finished = false;

    const tick = (t: number) => {
      const dt = Math.min(0.04, (t - last) / 1000);
      last = t;
      const time = (t - startedAt) / 1000;
      now.current = time;

      // --- progresso (o sol) ---
      let p = progress.current;
      if (!readyRef.current) {
        const rate = slowRef.current ? 0.07 : 0.6;
        p += (0.9 - p) * (1 - Math.exp(-dt * rate));
      } else {
        p = Math.min(1, p + dt * (reduced ? 3 : 0.85));
      }
      progress.current = p;
      if (readyRef.current && p >= 1 && t - startedAt >= MIN_SHOW_MS && !doneAt) doneAt = t;
      if (doneAt && !finished && t - doneAt > 450) {
        finished = true;
        setLeaving(true);
        window.setTimeout(() => doneRef.current(), 420);
      }

      // --- chuva de moedas ---
      if (!reduced && time - lastRain > 1.5 && coins.current.length < 6) {
        lastRain = time;
        spawn(90 + Math.random() * 120, 34, (Math.random() - 0.5) * 80, 40);
      }

      // --- física das moedas ---
      const keep: Coin[] = [];
      for (const c of coins.current) {
        c.spin += c.spinV * dt;
        if (drag.current?.id === c.id) {
          keep.push(c);
          continue;
        }
        c.vy += GRAVITY * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        // chão (gramado)
        if (c.y > GROUND - COIN_R) {
          c.y = GROUND - COIN_R;
          c.vy = Math.abs(c.vy) > 60 ? -c.vy * 0.45 : 0;
          c.vx *= 0.86;
          c.spinV *= 0.8;
        }
        // borda do círculo
        const dx = c.x - C;
        const dy = c.y - C;
        const d = Math.hypot(dx, dy);
        const lim = C - COIN_R - 2;
        if (d > lim) {
          const nx = dx / d;
          const ny = dy / d;
          c.x = C + nx * lim;
          c.y = C + ny * lim;
          const dot = c.vx * nx + c.vy * ny;
          if (dot > 0) {
            c.vx -= 1.6 * dot * nx;
            c.vy -= 1.6 * dot * ny;
          }
        }
        // cofrinho come a moeda que cai na fenda
        let eaten = false;
        if (c.vy > 0) {
          for (const pig of pigs.current) {
            if (Math.hypot(c.x - pig.x, c.y - (pig.y - 26)) < 17) {
              eaten = true;
              pig.eatAt = time;
              pops.current.push({ id: c.id, x: pig.x, y: pig.y - 38, at: time });
              setSaved((s) => s + 1);
              break;
            }
          }
        }
        if (!eaten) keep.push(c);
      }
      coins.current = keep;
      pops.current = pops.current.filter((p) => time - p.at < 0.9);

      setFrame((f) => (f + 1) % 1e6);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spawn]);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: pt.x, y: pt.y };
  };

  const grabCoin = (id: number) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    const c = coins.current.find((k) => k.id === id);
    if (!c) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = toSvg(e);
    drag.current = { id, dx: c.x - p.x, dy: c.y - p.y, trail: [{ ...p, t: performance.now() }], start: performance.now(), moved: 0 };
    c.vx = 0;
    c.vy = 0;
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const c = coins.current.find((k) => k.id === d.id);
    if (!c) return;
    const p = toSvg(e);
    const prev = d.trail.at(-1)!;
    d.moved += Math.hypot(p.x - prev.x, p.y - prev.y);
    d.trail.push({ ...p, t: performance.now() });
    if (d.trail.length > 6) d.trail.shift();
    c.x = clamp(p.x + d.dx, COIN_R, SIZE - COIN_R);
    c.y = clamp(p.y + d.dy, COIN_R, GROUND - COIN_R);
  };

  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const c = coins.current.find((k) => k.id === d.id);
    if (!c) return;
    const tap = d.moved < 5 && performance.now() - d.start < 300;
    if (tap) {
      // toque: a moeda dá um pulinho girando
      c.vy = -430;
      c.vx = (Math.random() - 0.5) * 140;
      c.spinV = 18;
      return;
    }
    const a = d.trail[0];
    const b = d.trail.at(-1)!;
    const dt = Math.max(16, b.t - a.t) / 1000;
    c.vx = clamp((b.x - a.x) / dt, -900, 900);
    c.vy = clamp((b.y - a.y) / dt, -900, 900);
    c.spinV = 10 + Math.hypot(c.vx, c.vy) / 40;
    // soltou em cima do cofrinho: ele guarda
    for (const pig of pigs.current) {
      if (Math.hypot(c.x - pig.x, c.y - (pig.y - 18)) < 26) {
        c.vx = (pig.x - c.x) * 2;
        c.vy = 60;
        c.y = Math.min(c.y, pig.y - 30);
      }
    }
  };

  const tapPig = (i: number) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    const pig = pigs.current[i];
    pig.jumpAt = now.current;
    // o porquinho pula e solta uma moeda pela fenda
    spawn(pig.x, pig.y - 34, (pig.flip ? -1 : 1) * (60 + Math.random() * 90), -380 - Math.random() * 120);
  };

  const p = progress.current;
  const time = now.current;
  const [skyTop, skyBottom] = sky(p);
  const night = smooth(0.62, 1, p);
  const sun = sunAt(p);
  const sunColor = mix("#ffd84d", "#ff7a3d", smooth(0.3, 0.9, p));
  const pct = Math.round(p * 100);

  return (
    <div
      className={
        "fixed inset-0 z-[100] flex items-center justify-center bg-white text-zinc-900 transition-opacity duration-500 select-none dark:bg-black dark:text-zinc-100 " +
        (leaving ? "pointer-events-none opacity-0" : "opacity-100")
      }
      style={{ touchAction: "none" }}
      role="progressbar"
      aria-label={message}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="flex flex-col items-center gap-5 px-4" style={zoom !== 1 ? { zoom } : undefined}>
      <div className="flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-sol.svg" alt="Corujinha" width={88} height={88} className="mb-1 size-[88px] animate-[ls-bob_2.4s_ease-in-out_infinite] motion-reduce:animate-none" />
        <div className="text-xl font-bold tracking-tight">Corujinha</div>
        <div className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{message}</div>
      </div>

      <div
        style={{ width: `min(calc(84vw / ${zoom}), calc(58dvh / ${zoom}), 380px)` }}
        className="relative aspect-square rounded-full shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:shadow-[0_20px_70px_-20px_rgba(120,140,255,0.35)] dark:ring-white/10"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="block size-full"
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-hidden
        >
          <defs>
            <clipPath id="ls-clip">
              <circle cx={C} cy={C} r={C} />
            </clipPath>
            <linearGradient id="ls-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={skyTop} />
              <stop offset="1" stopColor={skyBottom} />
            </linearGradient>
            <linearGradient id="ls-grass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8fd86f" />
              <stop offset="1" stopColor="#4ea64f" />
            </linearGradient>
            <radialGradient id="ls-sun">
              <stop offset="0" stopColor={sunColor} stopOpacity="0.55" />
              <stop offset="1" stopColor={sunColor} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="ls-coin" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#fff3b0" />
              <stop offset="0.45" stopColor="#fcc93a" />
              <stop offset="1" stopColor="#e09612" />
            </radialGradient>
            <mask id="ls-moon">
              <rect width={SIZE} height={SIZE} fill="#fff" />
              <circle cx={90} cy={64} r={12} fill="#000" />
            </mask>
          </defs>

          <g clipPath="url(#ls-clip)">
            <rect width={SIZE} height={SIZE} fill="url(#ls-sky)" />

            {/* estrelas e lua chegam com a noite */}
            <g opacity={smooth(0.7, 1, p)}>
              {STARS.map(([x, y, r], i) => (
                <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.6 + 0.4 * Math.sin(time * 3 + i)} />
              ))}
              <circle cx={82} cy={70} r={14} fill="#f6f1d5" mask="url(#ls-moon)" />
            </g>

            {/* trilho do sol: é a barra de progresso */}
            <path d={SUN_TRACK} fill="none" stroke="#fff" strokeOpacity={0.45 * (1 - night)} strokeWidth={1.5} strokeDasharray="2 5" strokeLinecap="round" />
            <circle cx={sun.x} cy={sun.y} r={42} fill="url(#ls-sun)" />
            <circle cx={sun.x} cy={sun.y} r={19} fill={sunColor} />

            {/* montanhas */}
            <path d="M0,214 L38,168 L70,190 L118,118 L160,176 L204,132 L248,176 L300,138 L300,300 L0,300 Z" fill={mix("#9fc2e6", "#2a3263", night)} />
            <path d="M104,135 L118,118 L132,138 L124,134 L117,141 L110,134 Z M193,145 L204,132 L216,147 L209,144 L204,150 L199,144 Z" fill={mix("#ffffff", "#8d93c4", night)} />
            <path d="M0,236 L46,198 L92,222 L150,184 L204,218 L252,194 L300,218 L300,300 L0,300 Z" fill={mix("#7aa7d4", "#232a55", night)} />

            {/* gramado */}
            <path d="M0,246 Q70,226 150,236 T300,240 L300,300 L0,300 Z" fill="url(#ls-grass)" />
            {[30, 58, 128, 160, 240, 270].map((x, i) => (
              <path key={x} d={`M${x},${262 + (i % 2) * 6} q2,-8 4,0 q2,-6 4,0`} stroke="#3f8f42" strokeWidth={1.4} fill="none" strokeLinecap="round" />
            ))}
            {[[46, 270, "#fff"], [142, 276, "#ffd1e3"], [252, 266, "#fff"]].map(([x, y, c]) => (
              <g key={`${x}`}>
                <circle cx={x as number} cy={y as number} r={2.4} fill={c as string} />
                <circle cx={x as number} cy={y as number} r={1} fill="#f5b700" />
              </g>
            ))}

            {/* porquinhos */}
            {pigs.current.map((pig, i) => {
              const tj = time - pig.jumpAt;
              const hop = tj < 0.45 ? Math.sin((Math.PI * tj) / 0.45) * 18 : 0;
              const te = time - pig.eatAt;
              const squash = te < 0.35 ? 1 + Math.sin((Math.PI * te) / 0.35) * 0.12 : 1;
              const bob = Math.sin(time * 2.2 + i * 1.7) * 1.2;
              return (
                <g
                  key={i}
                  transform={`translate(${pig.x} ${pig.y - hop + bob}) scale(${(pig.flip ? -1 : 1) * squash} ${2 - squash})`}
                  onPointerDown={tapPig(i)}
                  style={{ cursor: "pointer" }}
                >
                  <ellipse cx={0} cy={hop ? 10 + hop : 10} rx={24} ry={4} fill="#000" opacity={0.12} />
                  <Piggy />
                </g>
              );
            })}

            {/* +1 quando guarda moeda */}
            {pops.current.map((pp) => {
              const t = (time - pp.at) / 0.9;
              return (
                <text key={pp.id} x={pp.x} y={pp.y - t * 22} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff" stroke="#e05a92" strokeWidth={3} paintOrder="stroke" opacity={1 - t}>
                  +1
                </text>
              );
            })}

            {/* moedas */}
            {coins.current.map((c) => {
              const sx = Math.max(0.15, Math.abs(Math.cos(c.spin)));
              const appear = Math.min(1, (time - c.born) / 0.2);
              return (
                <g
                  key={c.id}
                  transform={`translate(${c.x} ${c.y}) scale(${sx * appear} ${appear})`}
                  onPointerDown={grabCoin(c.id)}
                  style={{ cursor: "grab" }}
                >
                  <circle r={COIN_R + 6} fill="transparent" />
                  <circle r={COIN_R} fill="url(#ls-coin)" stroke="#c27c0e" strokeWidth={1.4} />
                  <circle r={COIN_R - 3} fill="none" stroke="#f9e08a" strokeWidth={0.8} />
                  <text y={4.5} textAnchor="middle" fontSize={13} fontWeight={900} fill="#9a5b06">
                    $
                  </text>
                </g>
              );
            })}

            {/* a noite escurece a paisagem */}
            <rect width={SIZE} height={SIZE} fill="#0b1030" opacity={0.28 * night} pointerEvents="none" />
          </g>
        </svg>
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <div className="tabular text-sm font-semibold">{pct}%</div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {saved > 0
            ? `${saved} moeda${saved === 1 ? "" : "s"} no cofrinho`
            : "Toque nos cofrinhos e jogue as moedas neles"}
        </div>
      </div>
      </div>
    </div>
  );
}

/** Cofrinho de porquinho rosinha, olhando para a direita, com a fenda no alto. */
function Piggy() {
  return (
    <g>
      {/* rabinho */}
      <path d="M-24,-10 q-8,-4 -6,-10 q2,-5 6,-1 q3,4 -3,6" fill="none" stroke="#e77fa8" strokeWidth={2.2} strokeLinecap="round" />
      {/* perninhas */}
      <rect x={-16} y={0} width={7} height={10} rx={3} fill="#e98ab0" />
      <rect x={-4} y={1} width={7} height={9} rx={3} fill="#f19cbf" />
      <rect x={7} y={0} width={7} height={10} rx={3} fill="#e98ab0" />
      {/* corpo */}
      <ellipse cx={0} cy={-12} rx={26} ry={19} fill="#f9a8c9" />
      <ellipse cx={-6} cy={-20} rx={14} ry={7} fill="#fff" opacity={0.25} />
      {/* fenda */}
      <rect x={-7} y={-29.5} width={14} height={3.2} rx={1.6} fill="#b24d7a" />
      {/* orelha */}
      <path d="M8,-28 l6,-10 l5,11 Z" fill="#ec7fab" />
      {/* focinho */}
      <ellipse cx={25} cy={-10} rx={6.5} ry={7.5} fill="#f48fb8" />
      <ellipse cx={24} cy={-12.5} rx={1.3} ry={2} fill="#b24d7a" />
      <ellipse cx={24} cy={-7.5} rx={1.3} ry={2} fill="#b24d7a" />
      {/* olho e bochecha */}
      <circle cx={14} cy={-17} r={2.4} fill="#3b1d2b" />
      <circle cx={14.8} cy={-17.8} r={0.8} fill="#fff" />
      <ellipse cx={13} cy={-8} rx={4} ry={2.4} fill="#f472a6" opacity={0.45} />
    </g>
  );
}

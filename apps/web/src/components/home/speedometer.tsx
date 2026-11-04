/** Velocímetro de carro em 30 gomos (verde → amarelo → laranja → vermelho), aceso até a porcentagem. */
const CX = 120;
const CY = 118;
const R = 92;
const N = 30;
const GAP = 1.6;
const STOPS: [number, [number, number, number]][] = [
  [0, [34, 197, 94]],
  [0.55, [234, 179, 8]],
  [0.8, [249, 115, 22]],
  [1, [220, 38, 38]],
];

function pt(deg: number, r: number): [number, number] {
  const a = ((180 - deg) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

function hue(t: number): string {
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1];
      const [b, cb] = STOPS[i];
      const k = (t - a) / (b - a);
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * k)).join(",")})`;
    }
  }
  return "rgb(220,38,38)";
}

/** `shown`: liga a animação (gomos acendendo em sequência e o ponteiro acelerando até o valor). */
export function Speedometer({ ratio, label, shown = true }: { ratio: number; label: string; shown?: boolean }) {
  const pct = Math.max(0, Math.min(1, ratio));
  const segs = Array.from({ length: N }, (_, i) => {
    const [x0, y0] = pt((i * 180) / N + GAP / 2, R);
    const [x1, y1] = pt(((i + 1) * 180) / N - GAP / 2, R);
    const t = (i + 0.5) / N;
    return { d: `M${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`, color: t <= pct && shown ? hue(t) : "#e7e7ec", delay: Math.round(t * 900) };
  });
  const ticks = [0, 25, 50, 75, 100].map((v) => {
    const [x, y] = pt((v / 100) * 180, R - 26);
    return { v, x, y: y + 4 };
  });
  return (
    <svg viewBox="0 0 240 132" role="img" aria-label={label} className="block w-full">
      <defs>
        <filter id="ndl" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodOpacity=".25" />
        </filter>
      </defs>
      {segs.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill="none"
          stroke={s.color}
          strokeWidth={18}
          className="motion-reduce:transition-none"
          style={{ transition: "stroke .2s ease-out", transitionDelay: `${s.delay}ms` }}
        />
      ))}
      {ticks.map((t) => (
        <text key={t.v} x={t.x} y={t.y} textAnchor="middle" fontSize={10} fontWeight={600} fill="#71717a">
          {t.v}
        </text>
      ))}
      <g
        filter="url(#ndl)"
        className="motion-reduce:transition-none"
        style={{
          transform: `rotate(${shown ? pct * 180 : 0}deg)`,
          transformOrigin: `${CX}px ${CY}px`,
          transition: `transform ${0.3 + pct * 0.9}s cubic-bezier(.55,0,.25,1)`,
        }}
      >
        <path d={`M${CX},${CY - 5} L${CX - 80},${CY - 1} Q${CX - 84},${CY} ${CX - 80},${CY + 1} L${CX},${CY + 5} Z`} fill="#18181b" />
      </g>
      <circle cx={CX} cy={CY} r={12} fill="#18181b" />
      <circle cx={CX} cy={CY} r={5} fill="#fff" />
    </svg>
  );
}

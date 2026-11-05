"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Liga `shown` quando o elemento aparece na tela (uma vez só), para os gráficos animarem
 * ao serem revelados. Com "reduzir movimento" ligado no aparelho, já começa mostrado.
 */
export function useReveal<T extends Element = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, shown] as const;
}

/** Transição padrão dos gráficos: rápida, começa devagar e acelera no fim do movimento suave. */
export const GROW = "transition-[width,height,stroke-dasharray,clip-path,transform,opacity] duration-700 ease-out motion-reduce:transition-none";

"use client";

import { useRef } from "react";

/** Arrastar com o mouse para o lado (no celular, o dedo já rola). Sem barra de rolagem. */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const drag = useRef({ down: false, x: 0, left: 0, moved: false });
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse" || !ref.current) return;
      drag.current = { down: true, x: e.clientX, left: ref.current.scrollLeft, moved: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d.down || !ref.current) return;
      const dx = e.clientX - d.x;
      if (Math.abs(dx) > 4) d.moved = true;
      ref.current.scrollLeft = d.left - dx;
    },
    onPointerUp: () => {
      drag.current.down = false;
    },
    onPointerLeave: () => {
      drag.current.down = false;
    },
    /** Depois de arrastar, o soltar do mouse não conta como clique no item. */
    onClickCapture: (e: React.MouseEvent) => {
      if (drag.current.moved) {
        e.stopPropagation();
        e.preventDefault();
        drag.current.moved = false;
      }
    },
  };
  return [ref, handlers] as const;
}

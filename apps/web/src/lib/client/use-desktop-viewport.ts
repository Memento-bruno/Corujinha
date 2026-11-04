"use client";

import { useEffect, useState } from "react";

/** Largura em que a tela do computador cabe com tudo lado a lado. */
export const DESKTOP_WIDTH = 920;
const DEFAULT_VIEWPORT = "width=device-width, initial-scale=1";

/**
 * No celular, o Início mostra a mesma arrumação do computador, só que encolhida (pedido do Bruno):
 * o navegador desenha a página com 920px de largura e encolhe para caber na tela (dá para ampliar com os dedos).
 * Devolve o zoom para o menu de baixo continuar no tamanho normal de toque.
 */
export function useDesktopViewport(enabled: boolean): number {
  const [navZoom, setNavZoom] = useState(1);
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.getAttribute("content") || DEFAULT_VIEWPORT;
    const device = window.screen.width;
    if (enabled && device < DESKTOP_WIDTH) {
      meta.setAttribute("content", `width=${DESKTOP_WIDTH}, initial-scale=${(device / DESKTOP_WIDTH).toFixed(3)}`);
      setNavZoom(DESKTOP_WIDTH / device);
    } else {
      setNavZoom(1);
    }
    return () => {
      meta.setAttribute("content", original.startsWith(`width=${DESKTOP_WIDTH}`) ? DEFAULT_VIEWPORT : original);
    };
  }, [enabled]);
  return navZoom;
}

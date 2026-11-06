"use client";

import { useEffect, useState } from "react";

/** Largura em que a tela do computador cabe com tudo lado a lado. */
export const DESKTOP_WIDTH = 920;

/**
 * No celular, todas as telas mostram a arrumação do computador, só que encolhida (pedido do Bruno).
 * Quem faz isso é a meta viewport fixa `width=920`, que vem pronta do servidor em app/(app)/layout.tsx:
 * nada muda depois que a página abre (no iPhone, trocar a viewport com a página aberta faz a tela pular).
 *
 * Aqui só calculamos quanto o navegador encolheu a página, para o menu de baixo voltar ao tamanho
 * normal de toque. A conta usa a largura real da tela (que não muda ao dar zoom com os dedos), então
 * o menu fica parado. Computador (sem encolher) => 1.
 */
export function useNavZoom(): number {
  // 0,8: o menu fica um pouco menor que um menu comum de celular, para não tomar a tela.
  return useShrinkZoom(0.8, 3);
}

/**
 * Topo da tela (logo, Casal/Bruno/Patricia, formato dos valores e meses): no celular os botões
 * ficavam com ~2 mm, pequenos demais para o dedo. Crescem um pouco, sem chegar ao tamanho do menu,
 * para tudo continuar cabendo numa linha.
 */
export function useHeaderZoom(): number {
  return useShrinkZoom(0.62, 1.5);
}

/** Quanto desfazer o encolhimento da tela no celular (`factor` da proporção real), até `max`. */
function useShrinkZoom(factor: number, max: number): number {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const update = () => {
      const layout = document.documentElement.clientWidth;
      const landscape = window.matchMedia("(orientation: landscape)").matches;
      const { width, height } = window.screen;
      const physical = landscape ? Math.max(width, height) : Math.min(width, height);
      const z = physical > 0 && layout > physical ? Math.max(1, (layout / physical) * factor) : 1;
      setZoom(Math.min(max, Math.round(z * 100) / 100));
    };
    update();
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, [factor, max]);
  return zoom;
}

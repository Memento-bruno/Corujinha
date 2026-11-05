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
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const update = () => {
      const layout = document.documentElement.clientWidth;
      const landscape = window.matchMedia("(orientation: landscape)").matches;
      const { width, height } = window.screen;
      const physical = landscape ? Math.max(width, height) : Math.min(width, height);
      // 0,8: o menu fica um pouco menor que um menu comum de celular, para não tomar a tela.
      const z = physical > 0 && layout > physical ? (layout / physical) * 0.8 : 1;
      setZoom(Math.min(3, Math.round(z * 100) / 100));
    };
    update();
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return zoom;
}

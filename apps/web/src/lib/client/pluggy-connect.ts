"use client";

import { api } from "./store";

interface OpenOptions {
  /** Para reconectar uma conexão existente (modo atualização do widget). */
  itemId?: string;
  onSuccess: (itemId: string) => void | Promise<void>;
  onError: (message: string) => void;
}

/**
 * Abre o widget oficial Pluggy Connect. O banco é autorizado dentro do widget
 * (Open Finance); o app só recebe o id da conexão para ler as faturas depois.
 */
export async function openPluggyConnect({ itemId, onSuccess, onError }: OpenOptions): Promise<void> {
  const { accessToken } = await api<{ accessToken: string }>("/api/pluggy/connect-token", {
    method: "POST",
    body: JSON.stringify(itemId ? { itemId } : {}),
  });
  // Import dinâmico: o SDK mexe no window e não pode rodar no servidor.
  const { PluggyConnect } = await import("pluggy-connect-sdk");
  let done = false;
  const widget = new PluggyConnect({
    connectToken: accessToken,
    updateItem: itemId,
    includeSandbox: false,
    language: "pt",
    countries: ["BR"],
    onSuccess: async ({ item }) => {
      done = true;
      await onSuccess((item as { id: string }).id);
    },
    onError: ({ message }) => {
      if (!done) onError(message || "A Pluggy não conseguiu concluir a conexão.");
    },
    onClose: () => {
      void widget.destroy().catch(() => undefined);
    },
  });
  await widget.init();
}

/**
 * Manda um erro inesperado da tela para o registro do app (Ajustes → Erros do app).
 * No máximo 5 por abertura, sem repetir a mesma mensagem, e nunca quebra nada se falhar.
 */
const sent = new Set<string>();
const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/i, /Load failed$/i, /Failed to fetch/i, /NetworkError/i, /AbortError/i];

export function reportError(error: unknown, extra?: { path?: string }): void {
  if (typeof window === "undefined") return;
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Erro desconhecido");
  const message = (err.message || err.name || "Erro desconhecido").slice(0, 500);
  if (IGNORE.some((r) => r.test(message))) return;
  if (sent.has(message) || sent.size >= 5) return;
  sent.add(message);
  const body = JSON.stringify({
    message,
    path: (extra?.path ?? window.location.pathname).slice(0, 200),
    detail: err.stack?.split("\n").slice(0, 6).join("\n").slice(0, 1500),
  });
  void fetch("/api/erros", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

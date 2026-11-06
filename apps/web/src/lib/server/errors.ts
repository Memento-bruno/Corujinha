/** Erros sem dependências do Next (podem ser usados em qualquer lugar do servidor e nos testes). */
export class BadRequestError extends Error {}

export const DRIVE_AUTH_MESSAGE =
  "A conexão com o Google Drive venceu (o Google pede para renovar a cada 7 dias enquanto o app está em modo de teste). " +
  "Toque em \"Renovar conexão com o Drive\", copie o novo token para GOOGLE_DRIVE_REFRESH_TOKEN na Vercel e faça Redeploy.";

/** O Google recusou o token do Drive (vencido ou revogado)? */
export function isDriveAuthError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { message?: unknown; response?: { data?: { error?: unknown } } };
  const code = err.response?.data?.error;
  if (code === "invalid_grant" || code === "unauthorized_client") return true;
  return typeof err.message === "string" && /invalid_grant|Token has been expired or revoked/i.test(err.message);
}


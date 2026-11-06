import type { UserId } from "../domain/types";

/**
 * Leitura centralizada das variáveis de ambiente (apps/web/.env.local).
 *
 * Modos:
 * - Sem credenciais do Google => MODO DEMO: sem login, dados locais em `.data/` com
 *   dados de demonstração. Mesmo que o Drive esteja configurado, sem login o app
 *   NUNCA lê o Drive (para não expor dados reais sem autenticação).
 * - Com login configurado e Drive configurado => dados reais no Google Drive.
 * - Com login configurado e sem Drive => dados locais (útil para testar o login).
 */
function v(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const env = {
  get authSecret() {
    return v("AUTH_SECRET");
  },
  get googleClientId() {
    return v("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return v("GOOGLE_CLIENT_SECRET");
  },
  get allowedEmails(): Record<UserId, string | undefined> {
    return {
      USER_A: v("ALLOWED_USER_EMAIL_1")?.toLowerCase(),
      USER_B: v("ALLOWED_USER_EMAIL_2")?.toLowerCase(),
    };
  },
  get driveFolderId() {
    return v("GOOGLE_DRIVE_FOLDER_ID");
  },
  get driveAuthMode(): "oauth_refresh_token" | "service_account" {
    return v("GOOGLE_DRIVE_AUTH_MODE") === "service_account" ? "service_account" : "oauth_refresh_token";
  },
  get driveRefreshToken() {
    return v("GOOGLE_DRIVE_REFRESH_TOKEN");
  },
  get serviceAccountEmail() {
    return v("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  },
  get serviceAccountPrivateKey() {
    // Aceita a chave com "\n" literais (como vem no JSON) ou com quebras reais.
    return v("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  },
  get encryptionSecret() {
    return v("ENCRYPTION_SECRET");
  },
  get dataDir() {
    // Na Vercel (e em outros serverless) só /tmp aceita escrita; lá o fallback local é temporário.
    return v("LOCAL_DATA_DIR") ?? (process.env.VERCEL ? "/tmp/corujinha-data" : ".data");
  },
  get pluggyClientId() {
    return v("PLUGGY_CLIENT_ID");
  },
  get pluggyClientSecret() {
    return v("PLUGGY_CLIENT_SECRET");
  },
  /** Segredo que vai na URL do webhook (?token=). Sem ele, o webhook fica desligado. */
  get pluggyWebhookSecret() {
    return v("PLUGGY_WEBHOOK_SECRET");
  },
  /** Chave da Resend (resend.com) para os lembretes por e-mail. Sem ela, os lembretes ficam desligados. */
  get resendApiKey() {
    return v("RESEND_API_KEY");
  },
  /** Remetente dos lembretes (precisa ser de um domínio verificado na Resend, ou onboarding@resend.dev para testar). */
  get reminderFrom() {
    return v("REMINDER_FROM") ?? "Corujinha <onboarding@resend.dev>";
  },
  /** Segredo que a Vercel manda no cabeçalho Authorization das tarefas agendadas (cron). */
  get cronSecret() {
    return v("CRON_SECRET");
  },
  get appUrl() {
    return v("AUTH_URL") ?? "http://localhost:3000";
  },
};

export function isAuthConfigured(): boolean {
  return Boolean(env.googleClientId && env.googleClientSecret && env.authSecret && env.allowedEmails.USER_A);
}

export function isDriveConfigured(): boolean {
  if (!env.driveFolderId) return false;
  if (env.driveAuthMode === "service_account") {
    return Boolean(env.serviceAccountEmail && env.serviceAccountPrivateKey);
  }
  return Boolean(env.driveRefreshToken && env.googleClientId && env.googleClientSecret);
}

/** Variáveis do Drive que estão faltando (nomes, nunca valores). */
export function driveMissingVars(): string[] {
  const missing: string[] = [];
  if (!env.driveFolderId) missing.push("GOOGLE_DRIVE_FOLDER_ID");
  if (env.driveAuthMode === "service_account") {
    if (!env.serviceAccountEmail) missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    if (!env.serviceAccountPrivateKey) missing.push("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  } else if (!env.driveRefreshToken) missing.push("GOOGLE_DRIVE_REFRESH_TOKEN");
  if (!env.encryptionSecret) missing.push("ENCRYPTION_SECRET");
  return missing;
}

/**
 * Publicado (Vercel) com login, mas sem Drive: o único lugar para gravar seria o disco temporário
 * da Vercel, que some sozinho e é diferente em cada servidor. Nesse caso o app não abre os dados.
 * Para testar sem Drive no PC, nada muda.
 */
export function isStorageBlocked(): boolean {
  return Boolean(process.env.VERCEL) && isAuthConfigured() && driveMissingVars().length > 0 && !v("ALLOW_TEMPORARY_STORAGE");
}

export type StorageMode = "drive" | "local";

export function storageMode(): StorageMode {
  return isAuthConfigured() && isDriveConfigured() ? "drive" : "local";
}

export function isDemoMode(): boolean {
  return !isAuthConfigured();
}

/** Mapeia o e-mail Google para USER_A/USER_B. Retorna null para qualquer outro e-mail. */
export function userIdForEmail(email: string | null | undefined): UserId | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  const allowed = env.allowedEmails;
  if (allowed.USER_A && e === allowed.USER_A) return "USER_A";
  if (allowed.USER_B && e === allowed.USER_B) return "USER_B";
  return null;
}

/**
 * Open Finance só liga se as chaves existirem E, quando o app está publicado (Vercel),
 * o login Google estiver configurado. Sem login, um endereço público mostraria os
 * cartões reais para qualquer pessoa com o link.
 */
export function isPluggyConfigured(): boolean {
  return Boolean(env.pluggyClientId && env.pluggyClientSecret) && !isPluggyBlockedByMissingLogin();
}

/** Chaves da Pluggy presentes, mas o app está público sem login: bloqueado por segurança. */
export function isPluggyBlockedByMissingLogin(): boolean {
  return Boolean(env.pluggyClientId && env.pluggyClientSecret) && Boolean(process.env.VERCEL) && !isAuthConfigured();
}

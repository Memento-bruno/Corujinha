import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { env, isAuthConfigured, userIdForEmail } from "@/lib/server/env";

/**
 * Auth.js v5 com APENAS o provedor Google.
 * Regra crítica: o login só é aceito se o e-mail (verificado pelo Google) for exatamente
 * ALLOWED_USER_EMAIL_1 ou ALLOWED_USER_EMAIL_2. Qualquer outra conta é recusada no callback signIn.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Sem AUTH_SECRET o Auth.js não sobe; no modo demo usamos um segredo descartável
  // (nenhuma sessão é criada no modo demo, pois o login nem é exibido).
  secret: env.authSecret ?? (isAuthConfigured() ? undefined : "corujinha-demo-mode-no-login"),
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  providers: [
    Google({
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      authorization: { params: { prompt: "select_account", scope: "openid email profile" } },
    }),
  ],
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      if (!profile?.email || profile.email_verified !== true) return false;
      return userIdForEmail(profile.email) !== null;
    },
    async jwt({ token, profile }) {
      if (profile?.email) token.userId = userIdForEmail(profile.email) ?? undefined;
      return token;
    },
    async session({ session, token }) {
      // Revalida a cada requisição: se o e-mail sair da lista do .env, a sessão perde o acesso.
      const userId = userIdForEmail(session.user?.email);
      if (session.user) (session.user as { userId?: string }).userId = userId ?? undefined;
      void token;
      return session;
    },
  },
});

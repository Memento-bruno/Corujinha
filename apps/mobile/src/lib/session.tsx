import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createApi, type Api } from "./api";
import { createDemoApi, DEMO } from "./demo";
import { clearSession, loadSession, saveSession, type StoredSession } from "./secure";

interface SessionCtx {
  ready: boolean;
  session: StoredSession | null;
  api: Api | null;
  signIn: (s: StoredSession) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    loadSession()
      .then(setSession)
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<SessionCtx>(
    () => ({
      ready,
      session,
      api: session ? (DEMO ? createDemoApi(session.userId) : createApi(session.token)) : null,
      signIn: async (s) => {
        await saveSession(s);
        setSession(s);
      },
      signOut: async () => {
        await clearSession();
        setSession(null);
      },
    }),
    [ready, session],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession fora do SessionProvider");
  return ctx;
}

/** Atalho para telas autenticadas. */
export function useApi(): Api {
  const { api } = useSession();
  if (!api) throw new Error("sem sessão");
  return api;
}

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  HouseholdConfig,
  MonthKey,
  RecurringDebtsFile,
  StatementFile,
  UserId,
} from "../domain/types";
import type { ViewFilter } from "../engines/analytics";

interface Versioned<T> {
  data: T;
  etag: string | null;
}

export interface AppState {
  mode: {
    storage: "drive" | "local";
    demo: boolean;
    encrypted: boolean;
    authConfigured: boolean;
    driveConfigured: boolean;
  };
  viewer: { userId: UserId; email: string | null; image: string | null; demo: boolean };
  month: MonthKey;
  availableMonths: MonthKey[];
  config: Versioned<HouseholdConfig>;
  recurring: Versioned<RecurringDebtsFile>;
  statements: Record<MonthKey, Versioned<StatementFile>>;
}

export type SyncStatus = "loading" | "synced" | "saving" | "error" | "conflict";

interface Toast {
  id: number;
  message: string;
  tone: "info" | "error" | "success";
}

interface Store {
  state: AppState | null;
  error: string | null;
  sync: SyncStatus;
  month: MonthKey | null;
  setMonth: (m: MonthKey) => void;
  privacy: boolean;
  setPrivacy: (v: boolean) => void;
  view: ViewFilter;
  setView: (v: ViewFilter) => void;
  reload: () => Promise<void>;
  updateStatement: (month: MonthKey, fn: (s: StatementFile) => StatementFile) => Promise<void>;
  updateConfig: (fn: (c: HouseholdConfig) => HouseholdConfig) => Promise<void>;
  updateRecurring: (fn: (r: RecurringDebtsFile) => RecurringDebtsFile) => Promise<void>;
  closeMonth: (month: MonthKey, reopen?: boolean) => Promise<void>;
  toasts: Toast[];
  toast: (message: string, tone?: Toast["tone"]) => void;
}

const Ctx = createContext<Store | null>(null);

const PRIVACY_KEY = "corujinha:privacy";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, body.error ?? `Erro ${res.status}`);
  return body as T;
}

export { api };

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>("loading");
  const [month, setMonthState] = useState<MonthKey | null>(null);
  const [privacy, setPrivacyState] = useState(false);
  const [view, setView] = useState<ViewFilter>("COUPLE");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const stateRef = useRef<AppState | null>(null);
  stateRef.current = state;
  // Fila de gravações: garante que cada gravação use o ETag mais recente.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const toast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  useEffect(() => {
    try {
      setPrivacyState(localStorage.getItem(PRIVACY_KEY) === "1");
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  const setPrivacy = useCallback((v: boolean) => {
    setPrivacyState(v);
    try {
      localStorage.setItem(PRIVACY_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async (m?: MonthKey | null) => {
    setSync("loading");
    try {
      const s = await api<AppState>(`/api/state${m ? `?month=${m}` : ""}`);
      setState(s);
      setMonthState(s.month);
      setError(null);
      setSync("synced");
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError((e as Error).message);
      setSync("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(() => load(stateRef.current?.month), [load]);

  const setMonth = useCallback((m: MonthKey) => void load(m), [load]);

  const enqueue = useCallback(
    <T,>(job: () => Promise<T>): Promise<T> => {
      const run = queue.current.then(job, job);
      queue.current = run.catch(() => undefined);
      return run;
    },
    [],
  );

  const handleError = useCallback(
    async (e: unknown) => {
      if (e instanceof HttpError && e.status === 409) {
        setSync("conflict");
        toast("Os dados foram alterados no outro aparelho. Recarreguei a versão mais nova.", "error");
        await reload();
        return;
      }
      setSync("error");
      toast((e as Error).message || "Não foi possível salvar.", "error");
      await reload();
    },
    [reload, toast],
  );

  const updateStatement = useCallback(
    (m: MonthKey, fn: (s: StatementFile) => StatementFile) =>
      enqueue(async () => {
        const cur = stateRef.current?.statements[m];
        if (!cur) return;
        const next = fn(cur.data);
        setState((s) => (s ? { ...s, statements: { ...s.statements, [m]: { ...cur, data: next } } } : s));
        setSync("saving");
        try {
          const etag = stateRef.current?.statements[m]?.etag ?? cur.etag;
          const r = await api<Versioned<StatementFile>>(`/api/statements/${m}`, {
            method: "PUT",
            body: JSON.stringify({ data: next, etag }),
          });
          setState((s) => (s ? { ...s, statements: { ...s.statements, [m]: r } } : s));
          setSync("synced");
        } catch (e) {
          await handleError(e);
        }
      }),
    [enqueue, handleError],
  );

  const updateConfig = useCallback(
    (fn: (c: HouseholdConfig) => HouseholdConfig) =>
      enqueue(async () => {
        const cur = stateRef.current?.config;
        if (!cur) return;
        const next = fn(cur.data);
        setState((s) => (s ? { ...s, config: { ...cur, data: next } } : s));
        setSync("saving");
        try {
          const r = await api<Versioned<HouseholdConfig>>("/api/config", {
            method: "PUT",
            body: JSON.stringify({ data: next, etag: stateRef.current?.config.etag ?? cur.etag }),
          });
          setState((s) => (s ? { ...s, config: r } : s));
          setSync("synced");
        } catch (e) {
          await handleError(e);
        }
      }),
    [enqueue, handleError],
  );

  const updateRecurring = useCallback(
    (fn: (r: RecurringDebtsFile) => RecurringDebtsFile) =>
      enqueue(async () => {
        const cur = stateRef.current?.recurring;
        if (!cur) return;
        const next = fn(cur.data);
        setState((s) => (s ? { ...s, recurring: { ...cur, data: next } } : s));
        setSync("saving");
        try {
          const r = await api<Versioned<RecurringDebtsFile>>("/api/recurring", {
            method: "PUT",
            body: JSON.stringify({ data: next, etag: stateRef.current?.recurring.etag ?? cur.etag }),
          });
          setState((s) => (s ? { ...s, recurring: r } : s));
          setSync("synced");
        } catch (e) {
          await handleError(e);
        }
      }),
    [enqueue, handleError],
  );

  const closeMonth = useCallback(
    (m: MonthKey, reopen = false) =>
      enqueue(async () => {
        const cur = stateRef.current?.statements[m];
        if (!cur) return;
        setSync("saving");
        try {
          const r = await api<Versioned<StatementFile>>(`/api/statements/${m}/close`, {
            method: "POST",
            body: JSON.stringify({ etag: cur.etag, reopen }),
          });
          setState((s) => (s ? { ...s, statements: { ...s.statements, [m]: r } } : s));
          setSync("synced");
          toast(reopen ? "Mês reaberto para edição." : "Mês fechado. Snapshot salvo.", "success");
        } catch (e) {
          await handleError(e);
        }
      }),
    [enqueue, handleError, toast],
  );

  const value = useMemo<Store>(
    () => ({
      state,
      error,
      sync,
      month,
      setMonth,
      privacy,
      setPrivacy,
      view,
      setView,
      reload,
      updateStatement,
      updateConfig,
      updateRecurring,
      closeMonth,
      toasts,
      toast,
    }),
    [state, error, sync, month, setMonth, privacy, setPrivacy, view, reload, updateStatement, updateConfig, updateRecurring, closeMonth, toasts, toast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore fora do AppProvider");
  return s;
}

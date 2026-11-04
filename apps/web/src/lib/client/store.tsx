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
    pluggyConfigured: boolean;
    /** Chaves da Pluggy existem, mas o app está público sem login: bloqueado. */
    pluggyNeedsLogin?: boolean;
  };
  viewer: { userId: UserId; email: string | null; image: string | null; demo: boolean };
  month: MonthKey;
  availableMonths: MonthKey[];
  /** Mês da fatura em aberto (onde o app abre). */
  openMonth?: MonthKey;
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
  /** Valores em 10³ com 2 casas decimais (ex.: R$ 2,54×10³). */
  sci: boolean;
  setSci: (v: boolean) => void;
  view: ViewFilter;
  setView: (v: ViewFilter) => void;
  reload: () => Promise<void>;
  updateStatement: (month: MonthKey, fn: (s: StatementFile) => StatementFile) => Promise<void>;
  updateConfig: (fn: (c: HouseholdConfig) => HouseholdConfig) => Promise<void>;
  updateRecurring: (fn: (r: RecurringDebtsFile) => RecurringDebtsFile) => Promise<void>;
  closeMonth: (month: MonthKey, reopen?: boolean) => Promise<void>;
  /** Busca as faturas no Open Finance (Meu Pluggy). `silent` não mostra aviso quando nada mudou. */
  syncBank: (opts?: { silent?: boolean }) => Promise<void>;
  bankSyncing: boolean;
  toasts: Toast[];
  toast: (message: string, tone?: Toast["tone"]) => void;
}

const Ctx = createContext<Store | null>(null);

const PRIVACY_KEY = "corujinha:privacy";
const SCI_KEY = "corujinha:sci";
/** Sincroniza sozinho ao abrir o app se a última busca tiver mais de 6h. */
const AUTO_SYNC_MS = 6 * 60 * 60 * 1000;

export interface BankSyncSummary {
  added: number;
  updated: number;
  removed: number;
  months: Record<MonthKey, number>;
  skippedClosedMonths: MonthKey[];
  newCards: string[];
  accounts: number;
  errors: string[];
}

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
  const [sci, setSciState] = useState(false);
  const [view, setView] = useState<ViewFilter>("COUPLE");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bankSyncing, setBankSyncing] = useState(false);
  const autoSynced = useRef(false);
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
      setSciState(localStorage.getItem(SCI_KEY) === "1");
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  const setSci = useCallback((v: boolean) => {
    setSciState(v);
    try {
      localStorage.setItem(SCI_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
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

  const syncBank = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      setBankSyncing(true);
      try {
        const r = await api<BankSyncSummary>("/api/pluggy/sync", { method: "POST", body: JSON.stringify({ monthsBack: 6 }) });
        for (const err of r.errors) toast(err, "error");
        const fixed = (r.updated ?? 0) + (r.removed ?? 0);
        if (r.added > 0 || r.newCards.length > 0 || fixed > 0) {
          const parts = [`${r.added} compra${r.added === 1 ? "" : "s"} nova${r.added === 1 ? "" : "s"} do banco`];
          if (fixed) parts.push(`${fixed} corrigida${fixed === 1 ? "" : "s"}`);
          if (r.newCards.length) parts.push(`cartão novo: ${r.newCards.join(", ")}`);
          toast(parts.join(" · ") + ".", "success");
        } else if (!silent && r.errors.length === 0) {
          toast(`Tudo em dia: ${r.accounts} cartão(ões) conferido(s), nada novo.`, "info");
        }
        if (r.added > 0 || r.newCards.length > 0 || fixed > 0 || !silent) await reload();
        if (r.skippedClosedMonths.length && !silent) {
          toast(`Meses fechados não foram alterados: ${r.skippedClosedMonths.join(", ")}.`, "info");
        }
      } catch (e) {
        if (!silent) toast((e as Error).message, "error");
      } finally {
        setBankSyncing(false);
      }
    },
    [reload, toast],
  );

  useEffect(() => {
    if (!state || autoSynced.current) return;
    autoSynced.current = true;
    const cfg = state.config.data;
    if (!state.mode.pluggyConfigured || !cfg.pluggyItems?.length) return;
    const last = cfg.pluggyLastSyncAt ? Date.parse(cfg.pluggyLastSyncAt) : 0;
    if (Date.now() - last > AUTO_SYNC_MS) void syncBank({ silent: true });
  }, [state, syncBank]);

  const value = useMemo<Store>(
    () => ({
      state,
      error,
      sync,
      month,
      setMonth,
      privacy,
      setPrivacy,
      sci,
      setSci,
      view,
      setView,
      reload,
      updateStatement,
      updateConfig,
      updateRecurring,
      closeMonth,
      syncBank,
      bankSyncing,
      toasts,
      toast,
    }),
    [state, error, sync, month, setMonth, privacy, setPrivacy, sci, setSci, view, reload, updateStatement, updateConfig, updateRecurring, closeMonth, syncBank, bankSyncing, toasts, toast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore fora do AppProvider");
  return s;
}

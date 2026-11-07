"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  HouseholdConfig,
  MonthKey,
  RecurringDebtsFile,
  StatementFile,
  UserId,
} from "../domain/types";
import { monthRange } from "../domain/months";
import { changesAmounts, configChangesAmounts, fakeConfig, fakeRecurring, fakeStatement, newFakeSeed, restoreAmounts } from "../domain/fake";
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
    /** Lembretes por e-mail ligados no servidor (CRON_SECRET + RESEND_API_KEY). */
    remindersConfigured?: boolean;
    /** Os dois e-mails autorizados (ALLOWED_USER_EMAIL_1 e _2) estão definidos. */
    bothUsersAllowed?: boolean;
    /** Cópia de segurança semanal ligada (CRON_SECRET). */
    autoBackupConfigured?: boolean;
    /** Webhook da Pluggy ligado (PLUGGY_WEBHOOK_SECRET). */
    webhookConfigured?: boolean;
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
  /** Código do erro ao carregar (ex.: DRIVE_AUTH = conexão com o Drive venceu). */
  errorCode: string | null;
  sync: SyncStatus;
  month: MonthKey | null;
  setMonth: (m: MonthKey) => void;
  privacy: boolean;
  setPrivacy: (v: boolean) => void;
  /** Valores em milhares com 2 casas, sem a potência (ex.: R$ 4,26 = R$ 4.260). */
  sci: boolean;
  setSci: (v: boolean) => void;
  /** Valores fictícios: mesmas compras, valores trocados (só na tela, nunca salvo). */
  fake: boolean;
  setFake: (v: boolean) => void;
  /** Semente dos valores fictícios deste aparelho (0 = desligado). */
  fakeSeed: number;
  /** Sorteia outros valores fictícios. */
  rerollFake: () => void;
  view: ViewFilter;
  setView: (v: ViewFilter) => void;
  reload: () => Promise<void>;
  updateStatement: (month: MonthKey, fn: (s: StatementFile) => StatementFile) => Promise<void>;
  /** Resolve true se salvou; false se deu erro (o erro já aparece num aviso). */
  updateConfig: (fn: (c: HouseholdConfig) => HouseholdConfig) => Promise<boolean>;
  updateRecurring: (fn: (r: RecurringDebtsFile) => RecurringDebtsFile) => Promise<void>;
  closeMonth: (month: MonthKey, reopen?: boolean) => Promise<void>;
  /** Busca as faturas no Open Finance (Meu Pluggy). `silent` não mostra aviso quando nada mudou. */
  syncBank: (opts?: { silent?: boolean }) => Promise<void>;
  bankSyncing: boolean;
  /** Primeira busca no banco (só acontece uma vez, na primeira abertura): a tela de carregamento espera por ela. */
  firstSync: boolean;
  toasts: Toast[];
  toast: (message: string, tone?: Toast["tone"]) => void;
}

const Ctx = createContext<Store | null>(null);

const PRIVACY_KEY = "corujinha:privacy";
const SCI_KEY = "corujinha:sci";
const VIEW_KEY = "corujinha:view";
const FAKE_KEY = "corujinha:fake";
const FAKE_SEED_KEY = "corujinha:fake-seed";

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
    public code?: string,
  ) {
    super(message);
  }
}

/** Falha passageira (sem sinal, servidor fora do ar por um instante): vale tentar de novo. */
function isTransient(e: unknown): boolean {
  if (!(e instanceof HttpError)) return true; // fetch nem chegou ao servidor
  if (e.code === "DRIVE_AUTH" || e.code === "DRIVE_MISSING") return false;
  return e.status === 502 || e.status === 503 || e.status === 504;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** JSON com as chaves em ordem e sem os campos que o servidor preenche sozinho, para comparar versões. */
function comparable(data: unknown): string {
  const strip = (v: unknown, top: boolean): unknown => {
    if (Array.isArray(v)) return v.map((x) => strip(x, false));
    if (!v || typeof v !== "object") return v;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x === undefined || (top && k === "updatedAt") || k === "email") continue;
      out[k] = strip(x, false);
    }
    return out;
  };
  return JSON.stringify(strip(data, true));
}

/** `a` foi gravado antes de `b` (pelo horário que o servidor carimba em cada gravação)? */
function isOlder(a: unknown, b: unknown): boolean {
  const at = (x: unknown) => (x && typeof x === "object" ? (x as { updatedAt?: unknown }).updatedAt : undefined);
  const ta = at(a);
  const tb = at(b);
  return typeof ta === "string" && typeof tb === "string" && ta < tb;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Em "Dados inválidos", diz qual campo foi recusado, para dar para descobrir a causa.
    const field = Array.isArray(body.issues) ? body.issues[0]?.path?.filter((p: unknown) => typeof p === "string").join(".") : "";
    throw new HttpError(res.status, (body.error ?? `Erro ${res.status}`) + (field ? ` (${field})` : ""), typeof body.code === "string" ? body.code : undefined);
  }
  return body as T;
}

export { api };

/** Quantas vezes juntar a edição com uma versão mais nova antes de desistir. */
const MAX_MERGE_ATTEMPTS = 4;
/** Quantas vezes tentar de novo quando a internet falha, antes de desistir da edição. */
const MAX_NETWORK_RETRIES = 3;
/** De quanto em quanto tempo procurar mudanças feitas em outro aparelho. */
const REFRESH_EVERY_MS = 15_000;

/** Um arquivo do Drive: onde ele fica no estado e em qual endereço da API. */
interface Slot<T> {
  file: string;
  url: string;
  get: (s: AppState | null) => Versioned<T> | undefined;
  set: (s: AppState, v: Versioned<T>) => AppState;
}

const configSlot: Slot<HouseholdConfig> = {
  file: "household-config.json",
  url: "/api/config",
  get: (s) => s?.config,
  set: (s, v) => ({ ...s, config: v }),
};

const recurringSlot: Slot<RecurringDebtsFile> = {
  file: "recurring-debts.json",
  url: "/api/recurring",
  get: (s) => s?.recurring,
  set: (s, v) => ({ ...s, recurring: v }),
};

function statementSlot(m: MonthKey): Slot<StatementFile> {
  return {
    file: `statements-${m}.json`,
    url: `/api/statements/${m}`,
    get: (s) => s?.statements[m],
    set: (s, v) => ({ ...s, statements: { ...s.statements, [m]: v } }),
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>("loading");
  const [month, setMonthState] = useState<MonthKey | null>(null);
  const [privacy, setPrivacyState] = useState(false);
  const [sci, setSciState] = useState(false);
  const [fake, setFakeState] = useState(false);
  const [seed, setSeed] = useState(0);
  const fakeRef = useRef(false);
  const seedRef = useRef(0);
  seedRef.current = seed;
  const [view, setViewState] = useState<ViewFilter>("COUPLE");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bankSyncing, setBankSyncing] = useState(false);
  const [firstSync, setFirstSync] = useState(false);
  const autoSynced = useRef(false);
  // Cópia sempre em dia do estado. Atualizada na hora (não só quando a tela redesenha):
  // a próxima gravação da fila precisa ver o ETag e os dados que a anterior acabou de salvar.
  const stateRef = useRef<AppState | null>(null);
  const commit = useCallback((fn: (s: AppState | null) => AppState | null) => {
    stateRef.current = fn(stateRef.current);
    setState(stateRef.current);
  }, []);
  // Fila de gravações: uma de cada vez, sempre a partir da versão mais nova.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // Gravações na fila ou em andamento: enquanto houver, não trazemos dados de outro aparelho.
  const pending = useRef(0);

  const toast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  useEffect(() => {
    try {
      setPrivacyState(localStorage.getItem(PRIVACY_KEY) === "1");
      setSciState(localStorage.getItem(SCI_KEY) === "1");
      let sd = Number(localStorage.getItem(FAKE_SEED_KEY));
      if (!Number.isInteger(sd) || sd <= 0) {
        sd = newFakeSeed();
        localStorage.setItem(FAKE_SEED_KEY, String(sd));
      }
      setSeed(sd);
      const f = localStorage.getItem(FAKE_KEY) === "1";
      fakeRef.current = f;
      setFakeState(f);
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "USER_A" || v === "USER_B" || v === "COUPLE") setViewState(v);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  /** De quem mostrar (casal ou um dos dois). Fica lembrado neste aparelho. */
  const setView = useCallback((v: ViewFilter) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
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

  const setFake = useCallback((v: boolean) => {
    fakeRef.current = v;
    setFakeState(v);
    setSeed((cur) => cur || newFakeSeed());
    try {
      localStorage.setItem(FAKE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const rerollFake = useCallback(() => {
    const sd = newFakeSeed();
    setSeed(sd);
    try {
      localStorage.setItem(FAKE_SEED_KEY, String(sd));
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

  /** `keep` mantém os meses já lidos (troca de mês); recarregar busca tudo de novo. */
  const load = useCallback(async (m?: MonthKey | null, keep = false) => {
    setSync("loading");
    try {
      const s = await api<AppState>(`/api/state${m ? `?month=${m}` : ""}`);
      // Guarda os meses já lidos: trocar de mês depois não precisa ir ao Drive de novo.
      commit((prev) => (prev && keep ? { ...s, statements: { ...prev.statements, ...s.statements } } : s));
      setMonthState(s.month);
      setError(null);
      setErrorCode(null);
      setSync("synced");
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError((e as Error).message);
      setErrorCode(e instanceof HttpError ? (e.code ?? null) : null);
      setSync("error");
    }
  }, [commit]);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(() => load(stateRef.current?.month), [load]);

  /** Troca de mês usando o que já foi carregado; só busca no Drive os meses que ainda não temos. */
  const setMonth = useCallback(
    (m: MonthKey) => {
      const cur = stateRef.current;
      if (cur && monthRange(m, 6).every((k) => cur.statements[k])) {
        commit((s) => (s ? { ...s, month: m } : s));
        setMonthState(m);
        return;
      }
      void load(m, true);
    },
    [load, commit],
  );

  const enqueue = useCallback(
    <T,>(job: () => Promise<T>): Promise<T> => {
      pending.current++;
      const run = queue.current.then(job, job).finally(() => {
        pending.current--;
      });
      queue.current = run.catch(() => undefined);
      return run;
    },
    [],
  );

  const handleError = useCallback(
    async (e: unknown) => {
      setSync("error");
      if (e instanceof HttpError && e.status === 409) {
        toast("Não consegui salvar agora porque os dados estavam mudando. Tente de novo.", "error");
      } else {
        toast((e as Error).message || "Não foi possível salvar.", "error");
      }
      await reload();
    },
    [reload, toast],
  );

  // Edições de cada arquivo que ainda não foram para o Drive, na ordem dos toques.
  const waiting = useRef(new Map<string, { fn: (d: unknown) => unknown; done: (ok: boolean) => void }[]>());
  // Última versão confirmada pelo servidor de cada arquivo com edição pendente (a tela mostra ela + as pendentes).
  const confirmed = useRef(new Map<string, Versioned<unknown>>());
  const inflight = useRef(new Set<string>());

  /** Mostra na tela a versão do servidor com as edições que ainda estão esperando. */
  const show = useCallback(
    <T,>(slot: Slot<T>, base: Versioned<T>) => {
      const rest = (waiting.current.get(slot.file) ?? []) as { fn: (d: T) => T }[];
      const data = rest.reduce((d, w) => w.fn(d), base.data);
      commit((s) => (s ? slot.set(s, { data, etag: base.etag }) : s));
    },
    [commit],
  );

  /**
   * Grava um arquivo aplicando `fn` na versão mais nova. A mudança aparece na tela na hora do toque;
   * a gravação vai para a fila. Vários toques seguidos no mesmo arquivo viram UMA gravação (com o
   * Drive levando segundos por gravação, cada toque esperava os anteriores e parecia travado).
   * Se outro aparelho (ou a sincronização com o banco) gravou antes, busca a versão nova, aplica as
   * mesmas edições em cima dela e tenta de novo, em vez de descartar o que a pessoa fez.
   */
  const flush = useCallback(
    async <T,>(slot: Slot<T>): Promise<void> => {
      const batch = (waiting.current.get(slot.file) ?? []) as { fn: (d: T) => T; done: (ok: boolean) => void }[];
      if (!batch.length) return;
      waiting.current.set(slot.file, []);
      inflight.current.add(slot.file);
      const finish = (ok: boolean) => batch.forEach((w) => w.done(ok));
      try {
        let base = (confirmed.current.get(slot.file) as Versioned<T> | undefined) ?? slot.get(stateRef.current);
        if (!base) return finish(false);
        setSync("saving");
        let networkRetries = 0;
        for (let attempt = 0; ; attempt++) {
          const next = batch.reduce((d, w) => w.fn(d), base.data);
          const etag = base.etag;
          show(slot, { data: next, etag });
          try {
            const r = await api<Versioned<T>>(slot.url, { method: "PUT", body: JSON.stringify({ data: next, etag }) });
            confirmed.current.set(slot.file, r);
            show(slot, r);
            setSync("synced");
            return finish(true);
          } catch (e) {
            // Sinal ruim: espera um pouco e tenta de novo em vez de desfazer a edição.
            if (isTransient(e) && networkRetries < MAX_NETWORK_RETRIES) {
              networkRetries++;
              if (networkRetries === 1) toast("Sinal fraco: tentando salvar de novo…", "info");
              await sleep(1500 * 2 ** (networkRetries - 1));
              try {
                // A gravação pode ter chegado ao Drive mesmo sem a resposta voltar.
                const fresh = await api<Versioned<T>>(slot.url);
                if (fresh.etag !== etag) {
                  if (comparable(fresh.data) === comparable(next)) {
                    confirmed.current.set(slot.file, fresh);
                    show(slot, fresh);
                    setSync("synced");
                    return finish(true);
                  }
                  base = fresh; // outro aparelho gravou no meio: junta a edição com a versão dele
                  confirmed.current.set(slot.file, fresh);
                }
              } catch {
                /* ainda sem conexão: tenta gravar de novo assim mesmo */
              }
              continue;
            }
            if (e instanceof HttpError && e.status === 409 && attempt < MAX_MERGE_ATTEMPTS) {
              try {
                base = await api<Versioned<T>>(slot.url);
                confirmed.current.set(slot.file, base);
                continue;
              } catch (e2) {
                await handleError(e2);
                return finish(false);
              }
            }
            await handleError(e);
            return finish(false);
          }
        }
      } finally {
        inflight.current.delete(slot.file);
        if (!waiting.current.get(slot.file)?.length) confirmed.current.delete(slot.file);
      }
    },
    [handleError, show, toast],
  );

  const save = useCallback(
    <T,>(slot: Slot<T>, fn: (d: T) => T): Promise<boolean> => {
      const cur = slot.get(stateRef.current);
      if (!cur) return Promise.resolve(false);
      const list = waiting.current.get(slot.file) ?? [];
      // Primeira edição pendente deste arquivo: o que está na tela é a versão do servidor.
      if (!list.length && !inflight.current.has(slot.file)) confirmed.current.set(slot.file, cur);
      return new Promise<boolean>((resolve) => {
        list.push({ fn: fn as (d: unknown) => unknown, done: resolve });
        waiting.current.set(slot.file, list);
        // Aparece na hora, sem esperar a fila.
        commit((s) => {
          const now = s ? slot.get(s) : undefined;
          return s && now ? slot.set(s, { data: fn(now.data), etag: now.etag }) : s;
        });
        void enqueue(() => flush(slot));
      });
    },
    [enqueue, flush, commit],
  );

  /**
   * Com os valores fictícios ligados, recusa a gravação que mudaria algum valor: o que está
   * na tela não é o valor real, e salvar isso estragaria os dados do Drive.
   */
  const blockedByFake = useCallback(
    <T,>(slot: Slot<T>, fn: (d: T) => T, changes: (a: T, b: T) => boolean): boolean => {
      if (!fakeRef.current) return false;
      const cur = slot.get(stateRef.current);
      if (!cur || !changes(cur.data, fn(cur.data))) return false;
      toast("Valores fictícios ligados: desligue em Ajustes para mudar valores.", "error");
      return true;
    },
    [toast],
  );

  const updateStatement = useCallback(
    async (m: MonthKey, fn: (s: StatementFile) => StatementFile) => {
      const slot = statementSlot(m);
      const safe = (s: StatementFile) => {
        const next = fn(s);
        return fakeRef.current ? { ...next, transactions: restoreAmounts(seedRef.current, s.transactions, next.transactions) } : next;
      };
      if (blockedByFake(slot, safe, (a, b) => changesAmounts(a.transactions, b.transactions))) return;
      await save(slot, safe);
    },
    [save, blockedByFake],
  );

  const updateConfig = useCallback(
    async (fn: (c: HouseholdConfig) => HouseholdConfig) => {
      if (blockedByFake(configSlot, fn, configChangesAmounts)) return false;
      return save(configSlot, fn);
    },
    [save, blockedByFake],
  );

  const updateRecurring = useCallback(
    async (fn: (r: RecurringDebtsFile) => RecurringDebtsFile) => {
      const safe = (r: RecurringDebtsFile) => {
        const next = fn(r);
        return fakeRef.current ? { ...next, debts: restoreAmounts(seedRef.current, r.debts, next.debts) } : next;
      };
      if (blockedByFake(recurringSlot, safe, (a, b) => changesAmounts(a.debts, b.debts))) return;
      await save(recurringSlot, safe);
    },
    [save, blockedByFake],
  );

  const closeMonth = useCallback(
    (m: MonthKey, reopen = false) =>
      enqueue(async () => {
        const slot = statementSlot(m);
        let etag = slot.get(stateRef.current)?.etag;
        if (etag === undefined) return;
        setSync("saving");
        for (let attempt = 0; ; attempt++) {
          try {
            const r = await api<Versioned<StatementFile>>(`/api/statements/${m}/close`, {
              method: "POST",
              body: JSON.stringify({ etag, reopen }),
            });
            commit((s) => (s ? slot.set(s, r) : s));
            setSync("synced");
            toast(reopen ? "Mês reaberto para edição." : "Mês fechado. Snapshot salvo.", "success");
            return;
          } catch (e) {
            if (e instanceof HttpError && e.status === 409 && attempt < MAX_MERGE_ATTEMPTS) {
              try {
                const fresh = await api<Versioned<StatementFile>>(slot.url);
                commit((s) => (s ? slot.set(s, fresh) : s));
                etag = fresh.etag;
                continue;
              } catch (e2) {
                await handleError(e2);
                return;
              }
            }
            await handleError(e);
            return;
          }
        }
      }),
    [enqueue, handleError, toast, commit],
  );

  /**
   * Traz o que mudou em outro aparelho: pergunta ao servidor a versão de cada arquivo (uma
   * consulta leve) e só baixa os que mudaram. Nunca no meio de uma gravação.
   */
  const refreshing = useRef(false);
  const refreshChanged = useCallback(async () => {
    const cur = stateRef.current;
    if (!cur || refreshing.current || pending.current > 0 || document.visibilityState === "hidden") return;
    refreshing.current = true;
    try {
      const { files } = await api<{ files: Record<string, string> }>("/api/versions");
      const now = stateRef.current;
      if (!now || pending.current > 0) return;
      const slots: Slot<unknown>[] = [configSlot, recurringSlot, ...Object.keys(now.statements).map((m) => statementSlot(m))] as Slot<unknown>[];
      const changed = slots.filter((slot) => (files[slot.file] ?? null) !== (slot.get(now)?.etag ?? null));
      if (!changed.length) return;
      const fresh = await Promise.all(changed.map((slot) => api<Versioned<unknown>>(slot.url)));
      // Se alguém começou a editar enquanto baixávamos, deixa para a próxima rodada.
      if (pending.current > 0) return;
      commit((s) => {
        if (!s) return s;
        let out = s;
        changed.forEach((slot, i) => {
          const mine = slot.get(s);
          if (mine?.etag !== slot.get(now)?.etag) return;
          // A listagem do Drive às vezes fica alguns segundos atrasada e devolve a versão de antes da
          // nossa última gravação: nunca troca o que está na tela por uma versão mais velha.
          if (isOlder(fresh[i].data, mine?.data)) return;
          out = slot.set(out, fresh[i]);
        });
        return out;
      });
    } catch {
      /* sem conexão agora: tenta de novo na próxima */
    } finally {
      refreshing.current = false;
    }
  }, [commit]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshChanged();
    };
    const timer = setInterval(() => void refreshChanged(), REFRESH_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [refreshChanged]);

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

  // Busca a fatura no banco sozinho só na primeira vez (nunca sincronizado).
  // Depois disso o app usa o que já está salvo; para buscar compras novas há o botão "Sincronizar".
  useEffect(() => {
    if (!state || autoSynced.current) return;
    autoSynced.current = true;
    const cfg = state.config.data;
    if (!state.mode.pluggyConfigured || !cfg.pluggyItems?.length || cfg.pluggyLastSyncAt) return;
    setFirstSync(true);
    void syncBank({ silent: true }).finally(() => setFirstSync(false));
  }, [state, syncBank]);

  // O que as telas veem: com os valores fictícios ligados, uma cópia com os valores trocados.
  // As gravações continuam partindo dos dados reais (stateRef).
  const shown = useMemo<AppState | null>(() => {
    if (!state || !fake || !seed) return state;
    return {
      ...state,
      config: { ...state.config, data: fakeConfig(seed, state.config.data) },
      recurring: { ...state.recurring, data: fakeRecurring(seed, state.recurring.data) },
      statements: Object.fromEntries(Object.entries(state.statements).map(([m, s]) => [m, { ...s, data: fakeStatement(seed, s.data) }])),
    };
  }, [state, fake, seed]);

  const value = useMemo<Store>(
    () => ({
      state: shown,
      error,
      errorCode,
      sync,
      month,
      setMonth,
      privacy,
      setPrivacy,
      sci,
      setSci,
      fake,
      setFake,
      fakeSeed: fake ? seed : 0,
      rerollFake,
      view,
      setView,
      reload,
      updateStatement,
      updateConfig,
      updateRecurring,
      closeMonth,
      syncBank,
      bankSyncing,
      firstSync,
      toasts,
      toast,
    }),
    [shown, error, errorCode, sync, month, setMonth, privacy, setPrivacy, sci, setSci, fake, setFake, seed, rerollFake, view, reload, updateStatement, updateConfig, updateRecurring, closeMonth, syncBank, bankSyncing, firstSync, toasts, toast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore fora do AppProvider");
  return s;
}

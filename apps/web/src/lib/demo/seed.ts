/**
 * Dados de demonstração realistas e DETERMINÍSTICOS (mesma saída para o mesmo mês final).
 * Cobrem todos os casos dos motores: assinaturas duplicadas, inflação de assinatura,
 * estouro de setor, gastos formiguinha, parcelas futuras, compras individuais no cartão
 * do outro, divisão customizada, estornos e dívidas recorrentes fora do cartão.
 */
import { addMonths, monthDiff, monthRange } from "../domain/months";
import type {
  CategoryId,
  HouseholdConfig,
  MonthKey,
  RecurringDebtsFile,
  Split,
  StatementFile,
  Transaction,
  UserId,
} from "../domain/types";
import { guessCategory, merchantKeyOf } from "../importers/normalize";

export const DEMO_MONTHS = 6;

export function defaultConfig(names?: { a?: string; b?: string }): HouseholdConfig {
  return {
    schemaVersion: 1,
    users: {
      USER_A: { id: "USER_A", name: names?.a ?? "Bruno", avatarColor: "#6366f1" },
      USER_B: { id: "USER_B", name: names?.b ?? "Esposa", avatarColor: "#ec4899" },
    },
    cards: [],
    defaultSplitPercentA: 50,
    monthlyGoal: 900000,
    sectorBudgets: {
      mercado: 220000,
      delivery: 60000,
      restaurantes: 80000,
      lanches: 25000,
      transporte_app: 40000,
      compras: 120000,
      lazer: 40000,
      assinaturas: 30000,
    },
    savingsRules: { movingAverageThresholdPct: 15, highFrequencyMinOccurrences: 8 },
    subscriptionMerchants: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export function demoConfig(): HouseholdConfig {
  const c = defaultConfig();
  c.cards = [
    { id: "card-a-nu", owner: "USER_A", nickname: "Nubank", last4: "1327", brand: "mastercard", theme: 0 },
    { id: "card-a-itau", owner: "USER_A", nickname: "Itaú Personnalité", last4: "4410", brand: "visa", theme: 1 },
    { id: "card-b-inter", owner: "USER_B", nickname: "Inter", last4: "8802", brand: "mastercard", theme: 2 },
    { id: "card-b-xp", owner: "USER_B", nickname: "XP Visa Infinite", last4: "5519", brand: "visa", theme: 3 },
  ];
  return c;
}

/** PRNG determinístico (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const SHARED: Split = { type: "SHARED_DEFAULT" };
const ONLY_A: Split = { type: "INDIVIDUAL_A" };
const ONLY_B: Split = { type: "INDIVIDUAL_B" };

const CARD_OF: Record<UserId, string[]> = {
  USER_A: ["card-a-nu", "card-a-itau"],
  USER_B: ["card-b-inter", "card-b-xp"],
};

interface Builder {
  month: MonthKey;
  txs: Transaction[];
  r: () => number;
}

function add(
  b: Builder,
  opts: {
    description: string;
    amount: number;
    paidBy: UserId;
    day?: number;
    card?: string;
    split?: Split;
    category?: CategoryId;
    tags?: string[];
    installment?: { current: number; total: number };
  },
) {
  const day = opts.day ?? 1 + Math.floor(b.r() * 27);
  const merchantKey = merchantKeyOf(opts.description);
  b.txs.push({
    id: `demo-${b.month}-${b.txs.length.toString().padStart(3, "0")}`,
    date: `${b.month}-${String(day).padStart(2, "0")}`,
    description: opts.description,
    merchantKey,
    amount: opts.amount,
    cardId: opts.card ?? CARD_OF[opts.paidBy][0],
    paidBy: opts.paidBy,
    category: opts.category ?? guessCategory(opts.description, merchantKey),
    tags: opts.tags ?? [],
    split: opts.split ?? SHARED,
    installment: opts.installment,
    source: "demo",
  });
}

function between(r: () => number, min: number, max: number): number {
  return Math.round((min + r() * (max - min)) / 10) * 10;
}

const SUB = ["Assinatura"];

function buildMonth(month: MonthKey, end: MonthKey): StatementFile {
  const offset = monthDiff(month, end); // 0 = mês mais recente
  const isLatest = offset === 0;
  const b: Builder = { month, txs: [], r: rng(seedOf(`corujinha-${month}`)) };
  const r = b.r;

  // --- Assinaturas ------------------------------------------------------------
  add(b, { description: "Netflix.com", amount: offset <= 1 ? 5990 : 5590, paidBy: "USER_A", day: 5, tags: SUB });
  add(b, { description: "Spotify Família", amount: 3490, paidBy: "USER_A", day: 8, tags: SUB });
  add(b, { description: "Spotify", amount: 2190, paidBy: "USER_B", day: 9, card: "card-b-inter", tags: SUB });
  add(b, { description: "Disney Plus", amount: offset === 0 ? 4690 : 4390, paidBy: "USER_B", day: 12, tags: SUB });
  add(b, { description: "Prime Video", amount: 1990, paidBy: "USER_A", day: 14, card: "card-a-itau", tags: SUB });
  add(b, { description: "Apple.com/bill iCloud", amount: 1490, paidBy: "USER_B", day: 3, tags: SUB, split: ONLY_B });
  // Sem tag: o app sugere marcar como assinatura pela regra de repetição mensal
  add(b, { description: "Google One", amount: 999, paidBy: "USER_A", day: 21, category: "outros" });
  add(b, { description: "Smart Fit", amount: 14990, paidBy: "USER_B", day: 10, tags: SUB, split: ONLY_B, card: "card-b-xp" });

  // --- Delivery e transporte (formiguinhas) -----------------------------------
  const ifoodCount = isLatest ? 16 : 7 + Math.floor(r() * 4);
  for (let i = 0; i < ifoodCount; i++) {
    const paidBy: UserId = r() < 0.55 ? "USER_A" : "USER_B";
    add(b, { description: "IFD*iFood", amount: between(r, 3200, 8900), paidBy });
  }
  const uberCount = isLatest ? 14 : 8 + Math.floor(r() * 5);
  for (let i = 0; i < uberCount; i++) {
    const paidBy: UserId = r() < 0.5 ? "USER_A" : "USER_B";
    add(b, { description: "Uber *Trip", amount: between(r, 1400, 4600), paidBy, split: r() < 0.6 ? SHARED : paidBy === "USER_A" ? ONLY_A : ONLY_B });
  }
  const snacks = 6 + Math.floor(r() * 6);
  for (let i = 0; i < snacks; i++) {
    const paidBy: UserId = r() < 0.5 ? "USER_A" : "USER_B";
    const d = r() < 0.5 ? "Starbucks" : "Padaria Real";
    add(b, { description: d, amount: between(r, 1200, 3800), paidBy, split: paidBy === "USER_A" ? ONLY_A : ONLY_B });
  }

  // --- Mercado, restaurantes, combustível, farmácia ---------------------------
  const grocery = 4 + Math.floor(r() * 3);
  for (let i = 0; i < grocery; i++) {
    const paidBy: UserId = i % 2 === 0 ? "USER_A" : "USER_B";
    add(b, { description: r() < 0.5 ? "Pão de Açúcar" : "Carrefour", amount: between(r, 22000, 52000), paidBy, card: CARD_OF[paidBy][1] });
  }
  const restaurants = isLatest ? 5 : 2 + Math.floor(r() * 2);
  const places = ["Restaurante Coco Bambu", "Outback Steakhouse", "Pizzaria Bráz", "Sushi Kenzo", "Madero"];
  for (let i = 0; i < restaurants; i++) {
    add(b, { description: places[i % places.length], amount: between(r, 11000, 29000), paidBy: i % 2 ? "USER_B" : "USER_A" });
  }
  if (isLatest) {
    // Jantar de aniversário dividido 70/30
    add(b, { description: "Restaurante Fasano", amount: 64000, paidBy: "USER_B", day: 18, category: "restaurantes", split: { type: "SHARED_CUSTOM", percentA: 70 } });
  }
  add(b, { description: "Posto Shell", amount: between(r, 22000, 28000), paidBy: "USER_A", card: "card-a-itau" });
  add(b, { description: "Posto Ipiranga", amount: between(r, 20000, 26000), paidBy: "USER_B" });
  add(b, { description: "Drogasil", amount: between(r, 4000, 12000), paidBy: "USER_B" });
  add(b, { description: "Petz", amount: between(r, 9000, 18000), paidBy: "USER_A" });

  // --- Compras individuais no cartão do outro ----------------------------------
  add(b, { description: "Renner", amount: between(r, 15000, 32000), paidBy: "USER_A", split: ONLY_B, category: "compras" });
  if (offset % 2 === 0) add(b, { description: "Steam Games", amount: between(r, 4000, 12000), paidBy: "USER_B", split: ONLY_A, category: "lazer" });
  add(b, { description: "Mercado Livre", amount: between(r, 6000, 20000), paidBy: r() < 0.5 ? "USER_A" : "USER_B" });
  if (offset === 1) add(b, { description: "Estorno Amazon", amount: -4590, paidBy: "USER_A", category: "compras" });
  if (isLatest) add(b, { description: "Cinemark", amount: 9600, paidBy: "USER_A", category: "lazer" });

  // --- Parcelamentos -----------------------------------------------------------
  const plans: { description: string; amount: number; total: number; start: MonthKey; paidBy: UserId; split: Split; card?: string }[] = [
    { description: "Magalu Geladeira Brastemp", amount: 42990, total: 10, start: addMonths(end, -2), paidBy: "USER_A", split: SHARED },
    { description: "LATAM Passagens", amount: 31250, total: 6, start: addMonths(end, -1), paidBy: "USER_B", split: SHARED, card: "card-b-xp" },
    { description: "Apple iPhone", amount: 54990, total: 12, start: addMonths(end, -4), paidBy: "USER_A", split: ONLY_A, card: "card-a-itau" },
    { description: "Alura Cursos", amount: 8990, total: 10, start: addMonths(end, -5), paidBy: "USER_B", split: ONLY_B },
    { description: "Tok&Stok Sofá", amount: 38900, total: 8, start: addMonths(end, -7), paidBy: "USER_B", split: SHARED },
  ];
  for (const p of plans) {
    const k = monthDiff(p.start, month) + 1;
    if (k < 1 || k > p.total) continue;
    add(b, {
      description: p.description,
      amount: p.amount,
      paidBy: p.paidBy,
      split: p.split,
      card: p.card,
      day: 6,
      installment: { current: k, total: p.total },
    });
  }

  b.txs.sort((x, y) => x.date.localeCompare(y.date));
  return { schemaVersion: 1, month, transactions: b.txs, updatedAt: new Date(0).toISOString() };
}

export function demoStatements(end: MonthKey, count = DEMO_MONTHS): StatementFile[] {
  return monthRange(end, count).map((m) => buildMonth(m, end));
}

export function demoRecurring(end: MonthKey): RecurringDebtsFile {
  return {
    schemaVersion: 1,
    updatedAt: new Date(0).toISOString(),
    debts: [
      { id: "rec-aluguel", description: "Aluguel", kind: "CONTA_FIXA", amount: 280000, paidBy: "USER_A", split: SHARED, category: "moradia", dueDay: 5, startMonth: addMonths(end, -24), active: true },
      { id: "rec-condominio", description: "Condomínio", kind: "CONTA_FIXA", amount: 85000, paidBy: "USER_B", split: SHARED, category: "moradia", dueDay: 10, startMonth: addMonths(end, -24), active: true },
      { id: "rec-internet", description: "Internet Vivo Fibra", kind: "CONTA_FIXA", amount: 12990, paidBy: "USER_A", split: SHARED, category: "moradia", dueDay: 15, startMonth: addMonths(end, -12), active: true },
      { id: "rec-carro", description: "Financiamento do carro", kind: "FINANCIAMENTO", amount: 145000, paidBy: "USER_B", split: { type: "SHARED_CUSTOM", percentA: 60 }, category: "outros", dueDay: 20, startMonth: addMonths(end, -14), totalInstallments: 48, active: true },
      { id: "rec-plano", description: "Plano de saúde (dela)", kind: "CONTA_FIXA", amount: 62000, paidBy: "USER_A", split: ONLY_B, category: "saude", dueDay: 1, startMonth: addMonths(end, -6), active: true },
    ],
  };
}

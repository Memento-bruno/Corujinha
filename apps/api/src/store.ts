import type {
  Allocation,
  CardBill,
  CreditCard,
  Person,
  RecurringBill,
  SplitRule,
} from "@corujinha/core";

/**
 * Armazenamento do casal. Esta versão é em memória para o esqueleto;
 * a versão Postgres segue o esquema em db/migrations/001_init.sql.
 */
export interface HouseholdStore {
  people(): Promise<Person[]>;
  updatePerson(id: string, patch: Partial<Omit<Person, "id">>): Promise<Person>;
  rule(): Promise<SplitRule>;
  setRule(rule: SplitRule): Promise<void>;
  upsertCardsAndBills(cards: CreditCard[], bills: CardBill[]): Promise<void>;
  cards(): Promise<CreditCard[]>;
  bills(month: string): Promise<CardBill[]>;
  classification(): Promise<Record<string, Allocation>>;
  classify(transactionId: string, allocation: Allocation): Promise<void>;
  recurring(): Promise<RecurringBill[]>;
  saveRecurring(bill: RecurringBill): Promise<void>;
  deleteRecurring(id: string): Promise<void>;
}

export class MemoryStore implements HouseholdStore {
  private _people: Person[];
  private _rule: SplitRule = { kind: "equal" };
  private _cards = new Map<string, CreditCard>();
  private _bills = new Map<string, CardBill>();
  private _classification: Record<string, Allocation> = {};
  private _recurring = new Map<string, RecurringBill>();

  constructor(people: Person[]) {
    this._people = people;
  }

  async people() {
    return this._people.map((p) => ({ ...p }));
  }

  async updatePerson(id: string, patch: Partial<Omit<Person, "id">>) {
    const p = this._people.find((x) => x.id === id);
    if (!p) throw new Error("pessoa não encontrada");
    Object.assign(p, patch);
    return { ...p };
  }

  async rule() {
    return this._rule;
  }

  async setRule(rule: SplitRule) {
    this._rule = rule;
  }

  async upsertCardsAndBills(cards: CreditCard[], bills: CardBill[]) {
    for (const c of cards) this._cards.set(c.id, c);
    for (const b of bills) this._bills.set(b.id, b);
  }

  async cards() {
    return [...this._cards.values()];
  }

  async bills(month: string) {
    return [...this._bills.values()].filter((b) => b.referenceMonth === month);
  }

  async classification() {
    return { ...this._classification };
  }

  async classify(transactionId: string, allocation: Allocation) {
    this._classification[transactionId] = allocation;
  }

  async recurring() {
    return [...this._recurring.values()];
  }

  async saveRecurring(bill: RecurringBill) {
    this._recurring.set(bill.id, bill);
  }

  async deleteRecurring(id: string) {
    this._recurring.delete(id);
  }
}

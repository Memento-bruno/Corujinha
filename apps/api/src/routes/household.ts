import { randomUUID } from "node:crypto";
import {
  billsToExpenses,
  describeShares,
  recurringToExpenses,
  settle,
} from "@corujinha/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { HouseholdStore } from "../store.js";
import { allocation, cents, month, recurringBill, splitRule } from "./schemas.js";

export function householdRoutes(app: FastifyInstance, { store }: { store: HouseholdStore }) {
  app.get("/household", async () => {
    const [people, rule] = await Promise.all([store.people(), store.rule()]);
    let shares: Record<string, number> | null = null;
    try {
      shares = describeShares(rule, people);
    } catch {
      shares = null; // ex.: regra proporcional sem renda cadastrada
    }
    return { people, rule, shares };
  });

  // Cada pessoa só altera a própria remuneração.
  app.put("/household/me/income", async (req) => {
    const { monthlyIncome } = z.object({ monthlyIncome: cents.positive() }).parse(req.body);
    return store.updatePerson(req.userId!, { monthlyIncome });
  });

  app.put("/household/rule", async (req) => {
    const rule = splitRule.parse(req.body);
    describeShares(rule, await store.people()); // valida (lança SplitError)
    await store.setRule(rule);
    return { rule };
  });

  app.get("/bills", async (req) => {
    const q = z.object({ month }).parse(req.query);
    const [cards, bills, classification] = await Promise.all([
      store.cards(),
      store.bills(q.month),
      store.classification(),
    ]);
    return { cards, bills, classification };
  });

  app.put("/transactions/:id/allocation", async (req) => {
    const { id } = z.object({ id: z.string().min(1).max(128) }).parse(req.params);
    const body = allocation.parse(req.body);
    await store.classify(id, body);
    return { id, allocation: body };
  });

  app.get("/recurring-bills", async () => ({ items: await store.recurring() }));

  app.post("/recurring-bills", async (req, reply) => {
    const body = recurringBill.parse(req.body);
    const bill = { ...body, id: body.id ?? randomUUID() };
    await store.saveRecurring(bill);
    return reply.code(201).send(bill);
  });

  app.delete("/recurring-bills/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await store.deleteRecurring(id);
    return reply.code(204).send();
  });

  app.get("/settlement", async (req) => {
    const q = z.object({ month }).parse(req.query);
    const [people, rule, cards, bills, classification, recurring] = await Promise.all([
      store.people(),
      store.rule(),
      store.cards(),
      store.bills(q.month),
      store.classification(),
      store.recurring(),
    ]);
    const expenses = [
      ...billsToExpenses(bills, cards, classification),
      ...recurringToExpenses(recurring),
    ];
    return { month: q.month, ...settle(people, expenses, rule) };
  });
}

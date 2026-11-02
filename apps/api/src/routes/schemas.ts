import { z } from "zod";

export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use AAAA-MM");
export const cents = z.number().int();

export const splitRule = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("equal") }),
  z.object({ kind: z.literal("proportional_income") }),
  z.object({ kind: z.literal("custom"), sharesBps: z.record(z.string(), z.number().int().min(0).max(10_000)) }),
]);

export const allocation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("shared"), rule: splitRule.optional() }),
  z.object({ type: z.literal("personal"), ownerId: z.string().min(1) }),
]);

export const recurringBill = z.object({
  id: z.string().min(1).max(64).optional(),
  description: z.string().min(1).max(120),
  amount: cents.positive(),
  paidBy: z.string().min(1),
  allocation,
  dueDay: z.number().int().min(1).max(31),
  active: z.boolean().default(true),
});

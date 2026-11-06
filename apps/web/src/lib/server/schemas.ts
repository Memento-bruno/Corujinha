import { z } from "zod";
import { CATEGORY_IDS } from "../domain/categories";
import type { CategoryId } from "../domain/types";

const cents = z.number().int().min(-100_000_000).max(100_000_000);
const userId = z.enum(["USER_A", "USER_B"]);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const category = z.enum(CATEGORY_IDS as [CategoryId, ...CategoryId[]]);
const shortText = z.string().trim().min(1).max(140);

export const splitSchema = z
  .object({
    type: z.enum(["SHARED_DEFAULT", "SHARED_CUSTOM", "INDIVIDUAL_A", "INDIVIDUAL_B"]),
    percentA: z.number().min(0).max(100).optional(),
  })
  .refine((s) => s.type !== "SHARED_CUSTOM" || typeof s.percentA === "number", {
    message: "Informe o percentual da divisão customizada.",
  });

export const transactionSchema = z.object({
  id: z.string().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: shortText,
  merchantKey: z.string().max(80),
  amount: cents,
  cardId: z.string().min(1).max(80),
  paidBy: userId,
  category,
  tags: z.array(z.string().max(40)).max(10),
  split: splitSchema,
  installment: z.object({ current: z.number().int().min(1), total: z.number().int().min(1).max(99) }).optional(),
  source: z.enum(["demo", "csv", "ofx", "pdf", "pluggy", "manual"]),
  externalId: z.string().max(120).optional(),
  pluggyItemId: z.string().max(64).optional(),
});

export const statementSchema = z.object({
  schemaVersion: z.literal(1),
  month,
  transactions: z.array(transactionSchema).max(5000),
  snapshot: z.any().optional(),
  bankBills: z
    .record(z.string().max(80), z.object({ total: z.number().int(), paid: z.number().int(), status: z.enum(["paga", "parcial", "em aberto"]) }))
    .optional(),
  updatedAt: z.string(),
});

export const recurringSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string(),
  debts: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        description: shortText,
        kind: z.enum(["BOLETO", "CONTA_FIXA", "FINANCIAMENTO", "PARCELAMENTO", "ASSINATURA", "CARTAO"]),
        amount: cents,
        paidBy: userId,
        split: splitSchema,
        category,
        dueDay: z.number().int().min(1).max(31),
        startMonth: month,
        totalInstallments: z.number().int().min(1).max(600).optional(),
        active: z.boolean(),
        cardId: z.string().min(1).max(80).optional(),
        merchantKey: z.string().max(80).optional(),
      }),
    )
    .max(500),
});

export const configSchema = z.object({
  schemaVersion: z.literal(1),
  users: z.object({
    USER_A: z.object({ id: z.literal("USER_A"), name: shortText, email: z.string().optional(), avatarColor: z.string().max(20) }),
    USER_B: z.object({ id: z.literal("USER_B"), name: shortText, email: z.string().optional(), avatarColor: z.string().max(20) }),
  }),
  cards: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        owner: userId,
        nickname: shortText,
        // Somente os 4 últimos dígitos: rejeita qualquer tentativa de salvar o número inteiro
        last4: z.string().regex(/^\d{4}$/, "Informe apenas os 4 últimos dígitos."),
        brand: z.enum(["visa", "mastercard", "elo", "amex", "hipercard", "outra"]),
        theme: z.number().int().min(0).max(3),
        parentId: z.string().min(1).max(80).optional(),
        defaultSplit: splitSchema.optional(),
      }),
    )
    // Folga para cartões virtuais e adicionais criados pela sincronização do banco.
    .max(100),
  defaultSplitPercentA: z.number().min(0).max(100),
  monthlyGoal: cents.min(0),
  incomes: z.partialRecord(userId, cents.min(0)).optional(),
  sectorBudgets: z.partialRecord(category, cents.min(0)),
  savingsRules: z.object({
    movingAverageThresholdPct: z.number().min(0).max(500),
    highFrequencyMinOccurrences: z.number().int().min(2).max(100),
  }),
  subscriptionMerchants: z.array(z.string().max(80)).max(200),
  merchantRules: z
    .record(
      z.string().min(1).max(80),
      z.object({ name: shortText, category: category.optional(), split: splitSchema.optional(), updatedAt: z.string().max(40) }),
    )
    .refine((r) => Object.keys(r).length <= 3000, { message: "Fornecedores demais." })
    .optional(),
  pluggyItems: z
    .array(z.object({ itemId: z.string().regex(/^[0-9a-f-]{36}$/i, "itemId inválido"), owner: userId }))
    .max(10)
    .optional(),
  pluggyLastSyncAt: z.string().optional(),
  updatedAt: z.string(),
});

export const etagSchema = z.string().max(200).nullable();

export const importCommitSchema = z.object({
  cardId: z.string().min(1).max(80),
  month,
  source: z.enum(["csv", "ofx", "pdf"]),
  rows: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: shortText,
        amount: cents,
        installment: z.object({ current: z.number().int().min(1), total: z.number().int().min(1).max(99) }).optional(),
      }),
    )
    .min(1)
    .max(2000),
});

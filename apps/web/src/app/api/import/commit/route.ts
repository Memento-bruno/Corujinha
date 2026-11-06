import { randomUUID } from "node:crypto";
import { ConflictError } from "@/lib/server/blob-store";
import { getDatabase } from "@/lib/server/database";
import { BadRequestError, handle } from "@/lib/server/http";
import { importCommitSchema } from "@/lib/server/schemas";
import { requireViewer } from "@/lib/server/session";
import { guessCategory, merchantKeyOf } from "@/lib/importers/normalize";
import { isSharedSplit, ownerSplit, type Transaction } from "@/lib/domain/types";

/**
 * Grava as linhas confirmadas na fatura do mês escolhido.
 * Ignora duplicatas (mesma data + descrição + valor + cartão), para permitir reimportar.
 * Leitura-modificação-escrita com ETag e até 3 tentativas em caso de conflito.
 */
export async function POST(req: Request) {
  return handle(async () => {
    await requireViewer();
    const body = importCommitSchema.parse(await req.json());
    const db = await getDatabase();
    const config = (await db.getConfig()).data;
    const card = config.cards.find((c) => c.id === body.cardId);
    if (!card) throw new BadRequestError("Cartão não encontrado. Cadastre-o em Ajustes.");

    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await db.getStatement(body.month);
      if (current.data.snapshot) throw new BadRequestError("Este mês já foi fechado.");
      const seen = new Set(current.data.transactions.map((t) => `${t.date}|${t.description}|${t.amount}|${t.cardId}`));
      const added: Transaction[] = [];
      for (const row of body.rows) {
        const key = `${row.date}|${row.description}|${row.amount}|${card.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const merchantKey = merchantKeyOf(row.description);
        const category = guessCategory(row.description, merchantKey);
        const rule = config.merchantRules?.[merchantKey];
        added.push({
          id: `imp-${randomUUID()}`,
          date: row.date,
          description: row.description,
          merchantKey,
          amount: row.amount,
          cardId: card.id,
          paidBy: card.owner,
          category: rule?.category ?? category,
          tags: (rule?.category ?? category) === "assinaturas" || config.subscriptionMerchants.includes(merchantKey) ? ["Assinatura"] : [],
          // Compra de cartão é do dono da fatura; só fica dividida se o casal marcou a loja como dividida.
          split: isSharedSplit(rule?.split) ? rule!.split! : ownerSplit(card.owner),
          installment: row.installment,
          source: body.source,
        });
      }
      try {
        await db.saveStatement(
          {
            ...current.data,
            transactions: [...current.data.transactions, ...added].sort((a, b) => a.date.localeCompare(b.date)),
          },
          current.etag,
        );
        return { added: added.length, duplicates: body.rows.length - added.length };
      } catch (e) {
        if (!(e instanceof ConflictError) || attempt === 2) throw e;
      }
    }
    return { added: 0 };
  });
}

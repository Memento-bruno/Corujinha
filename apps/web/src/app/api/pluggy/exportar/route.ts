import { NextResponse } from "next/server";
import { addMonths, monthOf } from "@/lib/domain/months";
import { getBills, getCreditAccounts, getTransactions, PluggyError } from "@/lib/integrations/pluggy-client";
import { getDatabase } from "@/lib/server/database";
import { isPluggyConfigured } from "@/lib/server/env";
import { getViewer } from "@/lib/server/session";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Baixa, como arquivo, o que o banco mandou via Open Finance (contas de cartão, faturas e lançamentos),
 * para conferência. Só leitura e só para quem está logado. Não inclui chaves nem tokens.
 */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Não autorizado", { status: 401 });
  if (!isPluggyConfigured()) return new NextResponse("Open Finance não configurado", { status: 400 });
  const db = await getDatabase();
  const cfg = (await db.getConfig()).data;
  const from = `${addMonths(monthOf(new Date()), -30)}-01`;
  const items = [];
  for (const item of cfg.pluggyItems ?? []) {
    try {
      const accounts = [];
      for (const account of await getCreditAccounts(item.itemId)) {
        const [transactions, bills] = await Promise.all([getTransactions(account.id, from), getBills(account.id)]);
        accounts.push({ account, bills, transactions });
      }
      items.push({ owner: item.owner, accounts });
    } catch (e) {
      items.push({ owner: item.owner, error: e instanceof PluggyError ? e.message : "erro inesperado" });
    }
  }
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), from, items }, null, 1);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="corujinha-conferencia-${monthOf(new Date())}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

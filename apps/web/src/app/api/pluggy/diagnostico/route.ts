import { NextResponse } from "next/server";
import { formatBRL } from "@/lib/domain/money";
import { getBills, getCreditAccounts, getTransactions, PluggyError } from "@/lib/integrations/pluggy-client";
import { brlAmount, expenseSign, isCardPayment, last4Of, mapCardTransactions, resolveCard } from "@/lib/integrations/pluggy-map";
import { addMonths, monthOf } from "@/lib/domain/months";
import { getDatabase } from "@/lib/server/database";
import { isPluggyConfigured } from "@/lib/server/env";
import { getViewer } from "@/lib/server/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/**
 * Página de conferência (só leitura, só para os dois logados): compara, fatura por fatura,
 * o total que o banco informa com o que o Corujinha calculou e com o que está salvo.
 */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Não autorizado", { status: 401 });
  if (!isPluggyConfigured()) return new NextResponse("Open Finance não configurado", { status: 400 });

  const db = await getDatabase();
  const cfg = (await db.getConfig()).data;
  const firstMonth = addMonths(monthOf(new Date()), -6);
  // Parcelas de compras antigas vêm com a data da compra original: buscamos 2 anos para trás.
  const from = `${addMonths(firstMonth, -24)}-01`;
  const parts: string[] = [];

  for (const item of cfg.pluggyItems ?? []) {
    try {
      for (const account of await getCreditAccounts(item.itemId)) {
        const { card } = resolveCard(account, item.owner, cfg.cards);
        const [txs, bills] = await Promise.all([getTransactions(account.id, from), getBills(account.id)]);
        const mapped = mapCardTransactions(txs, card, bills, []);
        const foreign = txs.filter((t) => t.currencyCode && t.currencyCode !== "BRL").length;
        const payments = txs.filter(isCardPayment).length;
        const pending = txs.filter((t) => (t.status ?? "").toUpperCase() === "PENDING").length;
        const noBill = txs.filter((t) => !t.creditCardMetadata?.billId).length;
        const installments = txs.filter((t) => (t.creditCardMetadata?.totalInstallments ?? 0) > 1).length;
        const dates = txs.map((t) => t.date.slice(0, 10)).sort();
        const sumPos = txs.filter((t) => brlAmount(t) > 0).length;

        const rows: string[] = [];
        const months = new Set<string>([...mapped.keys(), ...bills.map((b) => b.dueDate.slice(0, 7))]);
        for (const m of [...months].sort().reverse()) {
          if (m < firstMonth) continue;
          const bill = bills.find((b) => b.dueDate.slice(0, 7) === m);
          const ours = (mapped.get(m) ?? []).reduce((s, t) => s + t.amount, 0);
          const saved = (await db.getStatement(m)).data.transactions.filter((t) => t.cardId === card.id).reduce((s, t) => s + t.amount, 0);
          const bank = typeof bill?.totalAmount === "number" ? Math.round(bill.totalAmount * 100) : null;
          const diff = bank === null ? "" : formatBRL(ours - bank);
          rows.push(
            `<tr><td>${m}</td><td>${bank === null ? "—" : formatBRL(bank)}</td><td>${formatBRL(ours)}</td><td>${formatBRL(saved)}</td><td>${diff}</td><td>${(mapped.get(m) ?? []).length}</td></tr>`,
          );
        }
        parts.push(`<h2>${esc(card.nickname)} •${last4Of(account.number) ?? "????"}</h2>
<p>${txs.length} lançamentos desde ${dates[0] ?? "-"} · sinal ${expenseSign(txs) === 1 ? "positivo" : "invertido"} (${sumPos} positivos) · ${payments} pagamentos de fatura ignorados · ${pending} pendentes · ${foreign} em moeda estrangeira · ${installments} parcelados · ${noBill} sem fatura vinculada · ${bills.length} faturas informadas pelo banco</p>
<table><tr><th>Fatura</th><th>Banco</th><th>Corujinha calculou</th><th>Salvo no app</th><th>Diferença</th><th>Compras</th></tr>${rows.join("")}</table>`);
      }
    } catch (e) {
      parts.push(`<p style="color:#e11d48">Conexão ${esc(item.itemId.slice(0, 8))}…: ${esc(e instanceof PluggyError ? e.message : "erro inesperado")}</p>`);
    }
  }

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Conferência das faturas</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f5f7;color:#18181b;margin:0;padding:16px}main{max-width:760px;margin:0 auto;background:#fff;border-radius:20px;padding:20px}h1{font-size:18px}h2{font-size:15px;margin-top:24px}p{font-size:12px;color:#52525b}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:right;padding:6px 4px;border-bottom:1px solid #eee}th:first-child,td:first-child{text-align:left}</style></head>
<body><main><h1>Conferência das faturas (últimos 6 meses)</h1><p>Somente leitura. "Banco" é o total da fatura informado pelo Santander via Open Finance; pode incluir juros, IOF, anuidade e saldo anterior.</p>${parts.join("") || "<p>Nenhuma conexão cadastrada.</p>"}</main></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { formatBRL } from "@/lib/domain/money";
import { getBills, getCreditAccounts, getTransactions, PluggyError } from "@/lib/integrations/pluggy-client";
import { billPayments, brlAmount, expenseSign, isCardPayment, last4Of, mapCardTransactions, cardResolver } from "@/lib/integrations/pluggy-map";
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
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Não autorizado", { status: 401 });
  if (!isPluggyConfigured()) return new NextResponse("Open Finance não configurado", { status: 400 });

  const db = await getDatabase();
  const cfg = (await db.getConfig()).data;
  const firstMonth = addMonths(monthOf(new Date()), -6);
  // Parcelas de compras antigas vêm com a data da compra original: buscamos 2 anos para trás.
  const from = `${addMonths(firstMonth, -24)}-01`;
  const parts: string[] = [];
  const askedMonth = new URL(req.url).searchParams.get("mes");
  const detailMonth = askedMonth && /^\d{4}-\d{2}$/.test(askedMonth) ? askedMonth : addMonths(monthOf(new Date()), 1);

  for (const item of cfg.pluggyItems ?? []) {
    try {
      for (const account of await getCreditAccounts(item.itemId)) {
        const resolver = cardResolver(account, item.owner, cfg.cards);
        const card = resolver.main;
        const [txs, bills] = await Promise.all([getTransactions(account.id, from), getBills(account.id)]);
        const mapped = mapCardTransactions(txs, resolver.forTx, bills, []);
        const accountCards = new Set([card.id, ...resolver.created.map((c) => c.id)]);
        for (const list of mapped.values()) for (const t of list) accountCards.add(t.cardId);
        const cardFinals = [...new Set(txs.map((t) => last4Of(t.creditCardMetadata?.cardNumber)).filter(Boolean))];
        const foreign = txs.filter((t) => t.currencyCode && t.currencyCode !== "BRL").length;
        const payments = txs.filter(isCardPayment).length;
        const pending = txs.filter((t) => (t.status ?? "").toUpperCase() === "PENDING").length;
        const noBill = txs.filter((t) => !t.creditCardMetadata?.billId).length;
        const installments = txs.filter((t) => (t.creditCardMetadata?.totalInstallments ?? 0) > 1).length;
        const dates = txs.map((t) => t.date.slice(0, 10)).sort();
        const sumPos = txs.filter((t) => brlAmount(t) > 0).length;

        const payStatus = billPayments(bills, txs);
        const rows: string[] = [];
        const months = new Set<string>([...mapped.keys(), ...bills.map((b) => b.dueDate.slice(0, 7))]);
        for (const m of [...months].sort().reverse()) {
          if (m < firstMonth) continue;
          const bill = bills.find((b) => b.dueDate.slice(0, 7) === m);
          const ours = (mapped.get(m) ?? []).reduce((s, t) => s + t.amount, 0);
          const saved = (await db.getStatement(m)).data.transactions.filter((t) => accountCards.has(t.cardId)).reduce((s, t) => s + t.amount, 0);
          const bank = typeof bill?.totalAmount === "number" ? Math.round(bill.totalAmount * 100) : null;
          const diff = bank === null ? "" : formatBRL(ours - bank);
          rows.push(
            `<tr><td>${m}</td><td>${bank === null ? "—" : formatBRL(bank)}</td><td>${formatBRL(ours)}</td><td>${formatBRL(saved)}</td><td>${diff}</td><td>${bill ? (payStatus.get(bill.id)?.status ?? "—") : "em aberto"}</td><td>${(mapped.get(m) ?? []).length}</td></tr>`,
          );
        }
        const monthOfTx = new Map<string, string>();
        for (const [m, list] of mapped) for (const t of list) monthOfTx.set(t.id, m);
        const billMonth = new Map(bills.map((b) => [b.id, b.dueDate.slice(0, 7)]));
        const nowMonth = monthOf(new Date());
        // Compras que o app pôs num mês diferente da fatura informada pelo banco (deveria ser nenhuma).
        const movedRows = txs
          .filter((t) => t.creditCardMetadata?.billId && billMonth.has(t.creditCardMetadata.billId))
          .filter((t) => monthOfTx.has(`plg-${t.id}`) && monthOfTx.get(`plg-${t.id}`) !== billMonth.get(t.creditCardMetadata!.billId!))
          .slice(0, 50)
          .map((t) => `<tr><td>${esc((t.description || "").slice(0, 28))}</td><td>${billMonth.get(t.creditCardMetadata!.billId!)}</td><td>${monthOfTx.get(`plg-${t.id}`)}</td><td>${formatBRL(Math.round(Math.abs(brlAmount(t)) * 100))}</td></tr>`);
        // Mês atual em diante: o que é compra real (aberta) e o que é parcela prevista.
        const future = [...mapped.entries()].filter(([m]) => m >= nowMonth).sort(([a], [b]) => a.localeCompare(b));
        const futureRows = future.map(([m, list]) => {
          const prev = list.filter((t) => t.tags.includes("Prevista"));
          const real = list.filter((t) => !t.tags.includes("Prevista"));
          const sum = (l: typeof list) => formatBRL(l.reduce((s, t) => s + t.amount, 0));
          return `<tr><td>${m}</td><td>${sum(real)} (${real.length})</td><td>${sum(prev)} (${prev.length})</td><td>${sum(list)}</td></tr>`;
        });
        const byId = new Map(txs.map((t) => [`plg-${t.id}`, t]));
        const detail = (mapped.get(detailMonth) ?? [])
          .map((t) => {
            const raw = byId.get(t.id.replace(/-p\d+$/, ""));
            const kind = t.tags.includes("Prevista")
              ? "prevista"
              : (raw?.status ?? "").toUpperCase() === "PENDING"
                ? "pendente"
                : raw?.creditCardMetadata?.billId
                  ? billMonth.has(raw.creditCardMetadata.billId) ? "fatura " + billMonth.get(raw.creditCardMetadata.billId) : "fatura não listada"
                  : "sem fatura";
            return { t, kind, raw };
          })
          .sort((a, b) => a.kind.localeCompare(b.kind) || b.t.amount - a.t.amount);
        const detailRows = detail.map(
          ({ t, kind, raw }) =>
            `<tr><td>${esc(t.description.slice(0, 26))}</td><td>${kind}</td><td>${t.installment ? `${t.installment.current}/${t.installment.total}` : "—"}</td><td>${t.date}</td><td>${(raw?.creditCardMetadata?.purchaseDate ?? "—").slice(0, 10)}</td><td>${formatBRL(t.amount)}</td></tr>`,
        );
        const kinds = new Map<string, number>();
        for (const d of detail) kinds.set(d.kind, (kinds.get(d.kind) ?? 0) + d.t.amount);
        const detailTable = detailRows.length
          ? `<h3>Compras de ${detailMonth} no app</h3><p>${[...kinds].map(([k, v]) => `${k}: ${formatBRL(v)}`).join(" · ")}</p><table><tr><th>Compra</th><th>Tipo</th><th>Parcela</th><th>Data</th><th>Data da compra</th><th>Valor</th></tr>${detailRows.join("")}</table>`
          : "";
        const instTable =
          (futureRows.length
            ? `<h3>Faturas de ${nowMonth} em diante</h3><table><tr><th>Mês</th><th>Compras já lançadas</th><th>Parcelas previstas</th><th>Total</th></tr>${futureRows.join("")}</table>`
            : "") +
          (movedRows.length
            ? `<h3>Compras fora da fatura do banco</h3><table><tr><th>Compra</th><th>Fatura do banco</th><th>Mês no app</th><th>Valor</th></tr>${movedRows.join("")}</table>`
            : "") +
          detailTable;
        parts.push(`<h2>${esc(card.nickname)} •${last4Of(account.number) ?? "????"}</h2>
<p>${txs.length} lançamentos desde ${dates[0] ?? "-"} · sinal ${expenseSign(txs) === 1 ? "positivo" : "invertido"} (${sumPos} positivos) · ${payments} pagamentos de fatura ignorados · ${pending} pendentes · ${foreign} em moeda estrangeira · ${installments} parcelados · ${noBill} sem fatura vinculada · ${bills.length} faturas informadas pelo banco · finais de cartão nas compras: ${cardFinals.length ? cardFinals.map((f) => "•" + f).join(", ") : "não informados"}</p>
<table><tr><th>Fatura</th><th>Banco</th><th>Corujinha calculou</th><th>Salvo no app</th><th>Diferença</th><th>Situação</th><th>Compras</th></tr>${rows.join("")}</table>${instTable}`);
      }
    } catch (e) {
      parts.push(`<p style="color:#e11d48">Conexão ${esc(item.itemId.slice(0, 8))}…: ${esc(e instanceof PluggyError ? e.message : "erro inesperado")}</p>`);
    }
  }

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Conferência das faturas</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f5f7;color:#18181b;margin:0;padding:16px}main{max-width:760px;margin:0 auto;background:#fff;border-radius:20px;padding:20px}h1{font-size:18px}h2{font-size:15px;margin-top:24px}h3{font-size:13px;margin-top:16px}main{overflow-x:auto}p{font-size:12px;color:#52525b}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:right;padding:6px 4px;border-bottom:1px solid #eee}th:first-child,td:first-child{text-align:left}</style></head>
<body><main><h1>Conferência das faturas (últimos 6 meses)</h1><p>Somente leitura. "Banco" é o total da fatura informado pelo banco via Open Finance; pode incluir juros, IOF, anuidade e saldo anterior.</p>${parts.join("") || "<p>Nenhuma conexão cadastrada.</p>"}</main></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

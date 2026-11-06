"use client";

import { CheckCheck, ChevronRight, MessageCircleQuestion } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useStore } from "@/lib/client/store";
import { monthName } from "@/lib/domain/months";
import type { MonthKey, Transaction } from "@/lib/domain/types";

interface Line {
  key: string;
  month: MonthKey;
  filtro: "revisar" | "perguntas";
  icon: React.ReactNode;
  text: React.ReactNode;
}

/** "Para conferir": compras novas que ninguém revisou e perguntas de um para o outro. */
export function InboxCard() {
  const { state, setMonth } = useStore();
  const router = useRouter();
  const me = state!.viewer.userId;
  const first = (u: "USER_A" | "USER_B") => state!.config.data.users[u].name.split(" ")[0];

  const lines = useMemo(() => {
    const out: Line[] = [];
    const months = Object.keys(state!.statements).sort();
    for (const m of months) {
      const file = state!.statements[m].data;
      if (file.snapshot) continue;
      const txs: Transaction[] = file.transactions;
      const review = txs.filter((t) => t.toReview).length;
      if (review > 0)
        out.push({
          key: `rev-${m}`,
          month: m,
          filtro: "revisar",
          icon: <CheckCheck className="size-4 text-sky-700" />,
          text: (
            <>
              <b>{review}</b> compra{review === 1 ? "" : "s"} nova{review === 1 ? "" : "s"} para conferir na fatura de {monthName(m)}
            </>
          ),
        });
      for (const t of txs) {
        const q = t.question;
        if (!q) continue;
        if (!q.answer && q.by !== me)
          out.push({
            key: `q-${t.id}`,
            month: m,
            filtro: "perguntas",
            icon: <MessageCircleQuestion className="size-4 text-violet-700" />,
            text: (
              <>
                {first(q.by)} perguntou sobre <b>{t.description}</b>: “{q.text}”
              </>
            ),
          });
        else if (q.answer && q.by === me)
          out.push({
            key: `a-${t.id}`,
            month: m,
            filtro: "perguntas",
            icon: <MessageCircleQuestion className="size-4 text-emerald-700" />,
            text: (
              <>
                {first(q.answeredBy ?? (me === "USER_A" ? "USER_B" : "USER_A"))} respondeu sobre <b>{t.description}</b>: “{q.answer}”
              </>
            ),
          });
      }
    }
    return out;
  }, [state, me]); // eslint-disable-line react-hooks/exhaustive-deps

  if (lines.length === 0) return null;
  const go = (l: Line) => {
    setMonth(l.month);
    router.push(`/faturas?filtro=${l.filtro}`);
  };
  return (
    <section aria-labelledby="inbox-title" className="rounded-3xl border border-[#ebebef] bg-white p-3.5 sm:p-4 sm:px-5">
      <h2 id="inbox-title" className="flex items-center gap-2 text-[15px] font-bold">
        <CheckCheck className="size-[18px] text-[#4f52d6]" /> Para conferir
      </h2>
      <ul className="mt-2 divide-y divide-zinc-100">
        {lines.slice(0, 6).map((l) => (
          <li key={l.key}>
            <button type="button" onClick={() => go(l)} className="flex w-full items-center gap-2.5 py-2 text-left text-sm text-zinc-700">
              <span className="shrink-0">{l.icon}</span>
              <span className="min-w-0 flex-1">{l.text}</span>
              <ChevronRight className="size-4 shrink-0 text-zinc-400" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

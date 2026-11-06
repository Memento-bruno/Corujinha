"use client";

import { CheckCircle2, Circle, CircleDashed, HeartHandshake } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppState } from "@/lib/client/store";
import type { HouseholdConfig, UserId } from "@/lib/domain/types";
import { Card, CardHeader } from "../ui/card";
import { IconBox } from "../ui/icon-box";

type Status = "ok" | "falta" | "opcional";

export interface ReadinessItem {
  id: string;
  label: string;
  status: Status;
  /** O que fazer quando ainda falta (frase curta, sem jargão). */
  hint?: string;
}

const DEFAULT_PARTNER_NAMES = new Set(["esposa", "usuário b", "usuario b", "pessoa b"]);

/**
 * Lista do que falta para o casal usar o app no dia a dia. Só lê o que já existe:
 * configuração do servidor (sem valores nem e-mails) e o cadastro do casal.
 */
export function readinessItems(mode: AppState["mode"], cfg: HouseholdConfig, installed: boolean | null): ReadinessItem[] {
  const a = cfg.users.USER_A.name.split(" ")[0] || "Você";
  const b = cfg.users.USER_B.name.split(" ")[0] || "Parceiro(a)";
  const hasBank = (u: UserId) => (cfg.pluggyItems ?? []).some((i) => i.owner === u);
  const hasIncome = (u: UserId) => (cfg.incomes?.[u] ?? 0) > 0;
  const items: ReadinessItem[] = [
    {
      id: "login",
      label: "Só vocês dois conseguem entrar",
      status: mode.authConfigured && mode.bothUsersAllowed ? "ok" : "falta",
      hint: !mode.authConfigured
        ? "O login com Google ainda não está ligado no servidor."
        : `Falta o e-mail de ${b} na Vercel (ALLOWED_USER_EMAIL_2).`,
    },
    {
      id: "drive",
      label: "Dados guardados no Google Drive, criptografados",
      status: mode.storage === "drive" && mode.encrypted ? "ok" : "falta",
      hint: "Os dados ainda não estão indo para o Drive. Veja Segurança, logo abaixo.",
    },
    {
      id: "nome",
      label: "Nome da segunda pessoa no app",
      status: DEFAULT_PARTNER_NAMES.has(cfg.users.USER_B.name.trim().toLowerCase()) ? "falta" : "ok",
      hint: "Troque o nome em Casal, no topo desta tela.",
    },
    {
      id: "entrou",
      label: `${b} já entrou no app`,
      status: cfg.users.USER_B.onboardedAt ? "ok" : "falta",
      hint: `Mande o link do app para ${b} e peça para entrar com o próprio Gmail.`,
    },
    {
      id: "banco-a",
      label: `Cartões de ${a} conectados`,
      status: !mode.pluggyConfigured ? "opcional" : hasBank("USER_A") ? "ok" : "falta",
      hint: "Em Banco, escolha o dono e toque em Conectar banco.",
    },
    {
      id: "banco-b",
      label: `Cartões de ${b} conectados`,
      status: !mode.pluggyConfigured ? "opcional" : hasBank("USER_B") ? "ok" : "falta",
      hint: `${b} precisa da própria conta no Meu Pluggy. Em Banco, escolha ${b} como dono dos cartões e conecte com essa conta.`,
    },
    {
      id: "renda",
      label: "Renda dos dois preenchida",
      status: hasIncome("USER_A") && hasIncome("USER_B") ? "ok" : "opcional",
      hint: "Cada um coloca a própria em Renda. Serve só para as porcentagens.",
    },
    {
      id: "copia",
      label: "Cópia de segurança automática toda semana",
      status: mode.storage !== "drive" ? "opcional" : mode.autoBackupConfigured ? "ok" : "falta",
      hint: "Falta o CRON_SECRET na Vercel.",
    },
    {
      id: "lembrete",
      label: "Lembrete de vencimento por e-mail",
      status: mode.remindersConfigured ? "ok" : "opcional",
      hint: "Precisa de uma conta grátis na Resend (RESEND_API_KEY na Vercel).",
    },
    {
      id: "webhook",
      label: "Compras novas chegam com o app fechado",
      status: !mode.pluggyConfigured ? "opcional" : mode.webhookConfigured ? "ok" : "opcional",
      hint: "Sem isso, o app busca as compras ao abrir ou no botão Sincronizar.",
    },
  ];
  if (installed !== null) {
    items.push({
      id: "instalado",
      label: "Instalado na tela inicial deste aparelho",
      status: installed ? "ok" : "opcional",
      hint: "No Chrome: menu ⋮ → Adicionar à tela inicial. No iPhone (Safari): Compartilhar → Adicionar à Tela de Início.",
    });
  }
  return items;
}

function useInstalled(): boolean | null {
  const [installed, setInstalled] = useState<boolean | null>(null);
  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(Boolean(standalone));
  }, []);
  return installed;
}

const ICON: Record<Status, React.ReactNode> = {
  ok: <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />,
  falta: <Circle className="mt-0.5 size-4 shrink-0 text-amber-500" />,
  opcional: <CircleDashed className="mt-0.5 size-4 shrink-0 text-zinc-400" />,
};

/** "Pronto para o casal": o que já está certo e o que ainda falta, em ordem. */
export function ReadinessCard({ mode, cfg }: { mode: AppState["mode"]; cfg: HouseholdConfig }) {
  const installed = useInstalled();
  if (mode.demo) return null;
  const items = readinessItems(mode, cfg, installed);
  const missing = items.filter((i) => i.status === "falta").length;
  const done = items.filter((i) => i.status === "ok").length;
  return (
    <Card id="pronto">
      <CardHeader
        icon={<IconBox><HeartHandshake /></IconBox>}
        title="Pronto para o casal"
        subtitle={missing === 0 ? "Tudo o que é importante já está certo" : `${done} de ${items.length} prontos · faltam ${missing} importante${missing === 1 ? "" : "s"}`}
      />
      <ul className="space-y-2.5 text-sm">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-2.5">
            {ICON[i.status]}
            <span className="min-w-0">
              <span className={i.status === "ok" ? "text-zinc-700" : "font-semibold text-zinc-900"}>{i.label}</span>
              {i.status === "opcional" && <span className="ml-1.5 text-[11px] text-zinc-400">opcional</span>}
              {i.status !== "ok" && i.hint && <span className="block text-xs text-zinc-500">{i.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

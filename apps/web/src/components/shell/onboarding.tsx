"use client";

import { CalendarCheck, Eye, EyeOff, Landmark, PartyPopper, UserRound, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/lib/client/store";
import { parseMoneyToCents } from "@/lib/domain/money";
import { otherUser } from "@/lib/domain/types";
import { Button } from "../ui/button";
import { Input, Label } from "../ui/field";
import { Sheet } from "../ui/sheet";
import { useClosingActions } from "../ajustes/closing-card";

type Step = "nome" | "inicio" | "renda" | "banco" | "pronto";

/**
 * Primeiro acesso guiado (pensado para quem entra pela primeira vez, como a Patricia):
 * confirma o nome, a renda (só vira %) e mostra como conectar o próprio Meu Pluggy.
 * Aparece uma vez por pessoa; "Pular" também conta como visto.
 */
export function Onboarding() {
  const { state, updateConfig } = useStore();
  const router = useRouter();
  const me = state?.viewer.userId ?? "USER_A";
  const cfg = state?.config.data;
  const hasIncome = Boolean(cfg?.incomes?.[me]);
  const hasBank = Boolean(cfg?.pluggyItems?.some((i) => i.owner === me));
  const needed = Boolean(state && cfg && !state.mode.demo && state.mode.authConfigured && !cfg.users[me].onboardedAt && (!hasIncome || !hasBank));
  const [step, setStep] = useState<Step>("nome");
  const [name, setName] = useState(cfg?.users[me].name ?? "");
  const [income, setIncome] = useState("");
  const [show, setShow] = useState(false);
  const [closed, setClosed] = useState(false);
  const [since, setSince] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()));
  const closing = useClosingActions();
  if (!needed || closed || !cfg) return null;

  const partner = cfg.users[otherUser(me)].name.split(" ")[0];
  const finish = (go?: string) => {
    void updateConfig((c) => ({ ...c, users: { ...c.users, [me]: { ...c.users[me], onboardedAt: new Date().toISOString() } } }));
    setClosed(true);
    if (go) router.push(go);
  };
  // Data de início (fechamento): é do casal, então só pergunta enquanto ninguém escolheu.
  const askStart = !cfg.closing;
  const afterStart: Step = hasIncome ? (hasBank ? "pronto" : "banco") : "renda";
  const saveStart = async () => {
    if (since && (await closing.close(since))) setStep(afterStart);
  };
  const saveName = () => {
    const n = name.trim().slice(0, 140);
    if (n && n !== cfg.users[me].name) void updateConfig((c) => ({ ...c, users: { ...c.users, [me]: { ...c.users[me], name: n } } }));
    setStep(askStart ? "inicio" : afterStart);
  };
  const saveIncome = () => {
    const c = parseMoneyToCents(income);
    if (c !== null && c > 0) void updateConfig((x) => ({ ...x, incomes: { ...x.incomes, [me]: c } }));
    setStep(hasBank ? "pronto" : "banco");
  };

  const steps: Step[] = ["nome", ...(askStart || step === "inicio" ? (["inicio"] as Step[]) : []), ...(hasIncome ? [] : (["renda"] as Step[])), ...(hasBank ? [] : (["banco"] as Step[])), "pronto"];
  const idx = steps.indexOf(step);

  return (
    <Sheet open onOpenChange={(o) => !o && finish()} title="Bem-vindo(a) à Corujinha" description={`Passo ${idx + 1} de ${steps.length}`}>
      <div className="mb-4 flex gap-1.5" aria-hidden>
        {steps.map((s, i) => (
          <span key={s} className={"h-1.5 flex-1 rounded-full " + (i <= idx ? "bg-zinc-900" : "bg-zinc-200")} />
        ))}
      </div>

      {step === "nome" && (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-zinc-600">
            <UserRound className="mt-0.5 size-4 shrink-0" /> Aqui vocês dois veem as faturas dos cartões juntos, dividem cada compra e fazem o acerto do mês. O app só lê: nunca paga nem transfere nada.
          </p>
          <label className="block">
            <Label>Como você quer ser chamado(a)?</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={140} onKeyDown={(e) => e.key === "Enter" && saveName()} />
          </label>
          <Button className="w-full" onClick={saveName} disabled={!name.trim()}>
            Continuar
          </Button>
        </div>
      )}

      {step === "inicio" && (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-zinc-600">
            <CalendarCheck className="mt-0.5 size-4 shrink-0" /> Quando foi o último acerto de contas entre vocês? Tudo até esse dia (inclusive) fica fechado e o app passa a contar só o que vier depois.
          </p>
          <label className="block">
            <Label>Último acerto feito em</Label>
            <Input type="date" value={since} max={new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())} onChange={(e) => setSince(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(afterStart)}>
              Contar tudo
            </Button>
            <Button className="flex-1" onClick={() => void saveStart()} disabled={!since || closing.busy}>
              Fechar até aqui
            </Button>
          </div>
          <p className="text-xs text-zinc-500">Dá para mudar ou desfazer depois em Configurações → Fechamento por data.</p>
        </div>
      )}

      {step === "renda" && (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-zinc-600">
            <Wallet className="mt-0.5 size-4 shrink-0" /> Seu salário líquido serve só para mostrar quanto da renda os gastos usam. O valor fica escondido: nenhuma tela mostra o valor, nem para {partner}, só a porcentagem.
          </p>
          <label className="block">
            <Label>Seu salário líquido por mês</Label>
            <div className="flex gap-2">
              <Input
                type={show ? "text" : "password"}
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ex.: 8.500,00"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveIncome()}
              />
              <Button variant="outline" size="sm" type="button" onClick={() => setShow(!show)} aria-label={show ? "Esconder" : "Mostrar"}>
                {show ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </label>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(hasBank ? "pronto" : "banco")}>
              Depois
            </Button>
            <Button className="flex-1" onClick={saveIncome} disabled={!income.trim()}>
              Salvar
            </Button>
          </div>
        </div>
      )}

      {step === "banco" && (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-zinc-600">
            <Landmark className="mt-0.5 size-4 shrink-0" /> Para as suas compras chegarem sozinhas, conecte os seus cartões pelo Open Finance. É só leitura.
          </p>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-700">
            <li>
              Crie a <b>sua própria</b> conta em <b>meu.pluggy.ai</b> (não use a de {partner}) e autorize lá os seus bancos.
            </li>
            <li>
              Aqui no app, em <b>Configurações → Banco</b>, escolha que os cartões são seus e toque em <b>Conectar banco</b>.
            </li>
            <li>
              Na janela que abrir, escolha <b>MeuPluggy</b> e entre com a sua conta do passo 1.
            </li>
          </ol>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("pronto")}>
              Depois
            </Button>
            <Button className="flex-1" onClick={() => finish("/configuracoes#open-finance")}>
              Ir para Banco
            </Button>
          </div>
        </div>
      )}

      {step === "pronto" && (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-zinc-600">
            <PartyPopper className="mt-0.5 size-4 shrink-0" /> Tudo pronto. Algumas dicas:
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-zinc-700">
            <li>Em <b>Faturas</b>, toque numa compra para dizer de quem é. O app lembra o lugar para as próximas.</li>
            <li>Não sabe o que é uma compra? Abra ela e toque em <b>Perguntar para {partner}</b>.</li>
            <li>Em <b>Acerto</b> você vê quem deve quanto para quem no mês.</li>
          </ul>
          <Button className="w-full" onClick={() => finish()}>
            Começar
          </Button>
        </div>
      )}
    </Sheet>
  );
}

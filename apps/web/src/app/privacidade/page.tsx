import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidade · Corujinha",
  robots: { index: true, follow: false },
};

/** Página pública (sem login), exigida pelo Google para publicar a tela de consentimento OAuth. */
export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-2xl p-4 py-10">
      <div className="rounded-3xl border border-slate-100 bg-white p-6 text-[15px] leading-relaxed text-zinc-700 shadow-soft sm:p-8">
        <h1 className="mb-1 text-2xl font-bold text-zinc-900">Política de privacidade</h1>
        <p className="mb-6 text-sm text-zinc-500">Corujinha · atualizada em novembro de 2026</p>

        <h2 className="mt-6 mb-2 font-semibold text-zinc-900">Quem usa</h2>
        <p>
          O Corujinha é um aplicativo privado, de uso pessoal de um casal. Somente duas contas Google previamente autorizadas
          conseguem entrar; qualquer outra conta é recusada no login.
        </p>

        <h2 className="mt-6 mb-2 font-semibold text-zinc-900">Dados do Google que usamos</h2>
        <p>
          No login, o app recebe apenas o <b>nome</b>, o <b>e-mail</b> e a foto do perfil da conta Google (escopos
          <code className="mx-1 rounded bg-slate-100 px-1 text-sm">openid email profile</code>), usados só para identificar qual
          das duas pessoas está usando o app.
        </p>
        <p className="mt-2">
          O acesso ao Google Drive é usado exclusivamente para ler e gravar os arquivos do próprio app numa pasta do Drive do casal.
          O app não lê, não altera e não compartilha outros arquivos.
        </p>

        <h2 className="mt-6 mb-2 font-semibold text-zinc-900">Como os dados são guardados</h2>
        <p>
          As informações financeiras (faturas de cartão, divisões e contas recorrentes) são gravadas como arquivos criptografados
          (AES-256-GCM) na pasta do Google Drive do casal. Dos cartões, guardamos apenas os 4 últimos dígitos.
        </p>

        <h2 className="mt-6 mb-2 font-semibold text-zinc-900">O que não fazemos</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Não vendemos, não compartilhamos e não enviamos dados a terceiros, anunciantes ou serviços de IA.</li>
          <li>Não fazemos pagamentos, Pix ou transferências: o app é somente leitura.</li>
          <li>Não usamos cookies de rastreamento; só o cookie de sessão do login.</li>
        </ul>

        <h2 className="mt-6 mb-2 font-semibold text-zinc-900">Remoção</h2>
        <p>
          Para apagar os dados, basta excluir a pasta do app no Google Drive e revogar o acesso em{" "}
          <a className="font-semibold text-brand-600 underline" href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </a>
          .
        </p>

        <p className="mt-8 text-sm">
          <Link href="/login" className="font-semibold text-zinc-900 underline">
            Voltar para o login
          </Link>
        </p>
      </div>
    </main>
  );
}

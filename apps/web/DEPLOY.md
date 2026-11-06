# Publicar o Corujinha na Vercel (grátis)

Com o app online, vocês abrem um link no celular, entram com o Google e os dados ficam no Drive do casal.

## 1. Criar o projeto na Vercel
1. Entre em https://vercel.com com a sua conta do GitHub (plano **Hobby**, gratuito).
2. **Add New → Project** → importe o repositório `Memento-bruno/Corujinha`.
3. Em **Root Directory**, clique em *Edit* e escolha `apps/web`. O framework é detectado como **Next.js**.
4. Abra **Environment Variables** e cole as variáveis do seu `.env.local` (pode colar o arquivo inteiro de uma vez):
   `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_USER_EMAIL_1`, `ALLOWED_USER_EMAIL_2`,
   `GOOGLE_DRIVE_FOLDER_ID`, `ENCRYPTION_SECRET`, `GOOGLE_DRIVE_AUTH_MODE=oauth_refresh_token`
   e, se for usar Open Finance, `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`.
   Deixe `AUTH_URL` e `GOOGLE_DRIVE_REFRESH_TOKEN` para os passos 3 e 4.
5. Clique em **Deploy**. Ao final, anote o endereço, por exemplo `https://corujinha-xyz.vercel.app`.

## 2. Liberar o endereço no Google Cloud
Google Cloud Console → **APIs e serviços → Credenciais** → seu cliente OAuth:
- **Origens JavaScript autorizadas:** `https://corujinha-xyz.vercel.app`
- **URIs de redirecionamento autorizados** (adicione as duas, mantendo as de localhost):
  - `https://corujinha-xyz.vercel.app/api/auth/callback/google`
  - `https://corujinha-xyz.vercel.app/api/drive/callback`

## 3. Informar o endereço ao app
Na Vercel: **Settings → Environment Variables** → adicione `AUTH_URL=https://corujinha-xyz.vercel.app`
e faça **Deployments → ⋯ → Redeploy**.

## 4. Conectar o Google Drive
1. Abra o endereço, entre com o Google e vá em **Ajustes → Gerar refresh token do Drive**.
2. Copie o `GOOGLE_DRIVE_REFRESH_TOKEN` mostrado, adicione-o nas variáveis da Vercel e faça **Redeploy**.
3. Em **Ajustes**, confira se aparece "Google Drive (pasta compartilhada)" e "Criptografia: Ativa".

## 5. Evitar que o token expire em 7 dias
Na **Tela de consentimento OAuth** (Branding), preencha a página inicial `https://corujinha-xyz.vercel.app`,
a política de privacidade `https://corujinha-xyz.vercel.app/privacidade` e o domínio autorizado `corujinha-xyz.vercel.app`.
Depois clique em **Publicar app** (Em produção). O aviso de "app não verificado" que aparece é normal para uso privado.
Ao publicar, gere o refresh token de novo (passo 4).

## 6. Instalar no celular
Abra o link no Chrome (Android) ou Safari (iPhone) → **Adicionar à tela inicial**.

## 7. (Opcional) Atualizar sozinho com o app fechado: webhook da Pluggy
Sem isso, o app busca as compras ao abrir (no máximo a cada 6h) ou no botão **Sincronizar**.
Com o webhook, a Pluggy avisa o app quando chegam compras novas.

1. Gere um segredo aleatório (ex.: `openssl rand -hex 24`) e adicione na Vercel como `PLUGGY_WEBHOOK_SECRET`. Faça **Redeploy**.
2. No [dashboard da Pluggy](https://dashboard.pluggy.ai), na sua aplicação, cadastre um webhook com o evento **all** e a URL:
   `https://corujinha-xyz.vercel.app/api/webhooks/pluggy?token=SEU_SEGREDO`
3. O webhook só funciona com o app publicado (a Pluggy não alcança o `localhost`).

O webhook só dispara a mesma leitura do botão Sincronizar, e só para conexões cadastradas no app.
Sem o `?token=` correto, a chamada é recusada.

## 8. (Opcional) Lembrete de vencimento por e-mail
Todo dia às 8h (horário de Brasília) o app manda um e-mail para cada um com as contas e faturas **dele**
que vencem hoje ou daqui a 3 dias e ainda não foram marcadas com **Já paguei**. O e-mail não mostra valores.

1. Crie uma conta grátis em [resend.com](https://resend.com) (até 3.000 e-mails por mês) e gere uma **API Key**.
2. Na Vercel, adicione:
   - `RESEND_API_KEY` = a chave do passo 1
   - `CRON_SECRET` = um segredo aleatório (ex.: `openssl rand -hex 24`). A Vercel manda ele sozinha ao chamar a tarefa.
   - (Opcional) `REMINDER_FROM` = remetente de um domínio verificado na Resend, ex.: `Corujinha <lembrete@seudominio.com>`.
     Sem domínio próprio, a Resend só entrega para o e-mail dono da conta Resend.
3. Faça **Redeploy**. A tarefa agendada já está no `vercel.json` (`/api/cron/lembretes`, 11:00 UTC).
4. Cada um pode desligar o próprio lembrete em **Configurações → Contas e vencimentos**.

## 9. Cópia de segurança automática (recomendado)
Todo domingo de manhã o app guarda sozinho uma cópia de tudo na pasta do Drive (se não houver outra da última semana).
Usa o mesmo `CRON_SECRET` do passo 8: se ele já está na Vercel, não precisa fazer nada além do **Redeploy**.
Sem a Resend, dá para colocar só o `CRON_SECRET` (os lembretes ficam desligados e a cópia funciona).

## 10. Antes de começar a usar no dia a dia
Abra **Configurações → Pronto para o casal**. O cartão mostra, item por item, o que já está certo e o que falta
(login só de vocês dois, Drive, nome e primeiro acesso da segunda pessoa, bancos de cada um, cópia semanal, lembretes).

Se algo der errado numa tela, o erro fica guardado em **Configurações → Erros do app**. Toque em **Copiar erros**
e cole na conversa para corrigir. O registro não guarda valores, e-mails nem números de cartão.

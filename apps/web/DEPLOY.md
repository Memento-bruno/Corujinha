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

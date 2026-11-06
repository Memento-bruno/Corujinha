# Corujinha · Roadmap

App web mobile-first (PWA) para o casal gerenciar as faturas de cartão juntos, dividir cada gasto e fazer o
encontro de contas do mês. Uso privado de **2 pessoas**, login com Google, Google Drive como banco de dados,
sugestões de corte por **regras determinísticas (sem IA)** e **100% somente leitura** para dinheiro.

O app novo fica em [`apps/web`](apps/web). As pastas `apps/mobile`, `apps/api` e `db/` são o protótipo
anterior (Expo + Fastify + Postgres) e serão removidas depois que a versão web estiver em uso.

## Fases

| Fase | Conteúdo | Status |
| --- | --- | --- |
| 0 | Estrutura Next.js (App Router + TS), ROADMAP, `.env.example` | ✅ |
| 1 | UI completa, motor de compensação, motor de cortes por regras, Modo Percentual, persistência Drive com fallback local, importador CSV/OFX/PDF, dados de demonstração | ✅ (este PR) |
| 2 | Configurar Google Cloud (OAuth + Drive) e ligar os dados reais | 🧑 Tarefa do usuário (em andamento) |
| 3 | Open Finance via Meu Pluggy: leitura automática das faturas dos cartões (somente leitura) | ✅ Entregue (falta testar com a conta real) |
| 4 | Deploy na Vercel e instalação como PWA nos dois celulares ([passo a passo](apps/web/DEPLOY.md)) | 🧑 Tarefa do usuário |
| 5 | Refinos: regras de categorização editáveis, histórico de fechamentos, exportar CSV, alertas de vencimento | ⏳ |

### Fase 1 em detalhe (entregue)

- **Auth.js v5** só com Google. O callback `signIn` aceita apenas `ALLOWED_USER_EMAIL_1` e `ALLOWED_USER_EMAIL_2`
  (e-mail verificado). Sem credenciais, o app sobe em modo demo e nunca toca no Drive.
- **DriveDatabaseService**: JSONs particionados numa pasta compartilhada, AES-256-GCM com chave derivada de
  `ENCRYPTION_SECRET` (scrypt, salt por arquivo, nome do arquivo como AAD) e controle otimista por ETag.
- **Motor de compensação**: `SHARED_DEFAULT`, `SHARED_CUSTOM`, `INDIVIDUAL_A`, `INDIVIDUAL_B`, em centavos
  inteiros, com memória de cálculo (total bruto → créditos → abatimento cruzado → valor final) e **Fechar Mês**
  (snapshot recalculado no servidor).
- **RuleBasedSavingsEngine**: assinaturas duplicadas, inflação de assinatura, estouro de média móvel/teto,
  gastos formiguinha (cortes de 30% e 50%) e simulador "E se cortarmos?".
- **Importador**: CSV (Nubank, Itaú, Inter, C6…), OFX e PDF com prévia antes de gravar; ignora pagamento da fatura
  e reconhece parcelas `03/10`.
- **Interface** baseada nas referências: KPIs com variação mensal, cartões holográficos (4 últimos dígitos),
  gráfico spline, rosca/barras por setor, medidor semicircular de saúde, parcelas futuras e navegação em pílula.

## Checklist de configuração

### Tarefa do usuário 1 · Google Cloud Console (Fase 2)

O passo a passo detalhado (onde clicar em cada tela) está na thread **"Configurar Google Cloud e Drive"** do projeto.
Resumo do que sai dela:

- [ ] Projeto criado no Google Cloud e **Google Drive API** ativada
- [ ] Tela de consentimento OAuth (Externo) com os 2 e-mails como usuários de teste, depois publicada **Em produção**
      (em "Teste", refresh tokens com escopo de Drive expiram em 7 dias)
- [ ] Cliente OAuth 2.0 "Aplicativo da Web" com os redirecionamentos
      `http://localhost:3000/api/auth/callback/google` e `http://localhost:3000/api/drive/callback`
- [ ] Pasta `Corujinha DB` criada no Drive e compartilhada entre os dois (Editor)
- [ ] `apps/web/.env.local` preenchido:
  - `AUTH_SECRET` e `ENCRYPTION_SECRET` (`openssl rand -base64 32`, um para cada)
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - `ALLOWED_USER_EMAIL_1`, `ALLOWED_USER_EMAIL_2`
  - `GOOGLE_DRIVE_FOLDER_ID`
- [ ] `npm run dev`, entrar com Google, abrir **Ajustes → Gerar refresh token do Drive** (`/api/drive/connect`)
      e colar `GOOGLE_DRIVE_REFRESH_TOKEN` no `.env.local`; reiniciar o servidor
- [ ] Ajustes mostra "Google Drive (pasta compartilhada)" e "Criptografia: Ativa"

> Por que refresh token e não Service Account? Service Accounts não têm cota no Drive pessoal (Gmail) e não
> conseguem criar arquivos numa pasta do "Meu Drive". Elas só servem com Drive compartilhado do Google Workspace
> (`GOOGLE_DRIVE_AUTH_MODE=service_account`).

### Tarefa do usuário 2 · Pluggy / Open Finance (Fase 3)

Usaremos o **Meu Pluggy** (uso pessoal gratuito, até 5 conexões, sem uso comercial):
- [ ] Cada um cria conta em [meu.pluggy.ai](https://meu.pluggy.ai) e autoriza os próprios bancos/cartões via Open Finance
- [ ] Em [dashboard.pluggy.ai](https://dashboard.pluggy.ai) (mesmo login): criar uma aplicação → Demo → Connect Account → **MeuPluggy**
- [ ] Copiar `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` (o secret aparece uma vez só) para o `.env.local` / Vercel
- [ ] No app, **Ajustes → Open Finance**: escolher de quem são os cartões e tocar em **Conectar banco**. Na janela da
      Pluggy, escolher **MeuPluggy** e entrar com a conta do Meu Pluggy. A primeira sincronização roda sozinha.
      (Alternativa: colar o Item ID da conexão em "Já tenho o Item ID".)
- [ ] Conferir as compras em Faturas. Se um dia o banco pedir nova autorização, use **Reconectar**.
- [ ] (Opcional, depois do deploy) Cadastrar o webhook da Pluggy para atualizar com o app fechado ([DEPLOY.md, passo 7](apps/web/DEPLOY.md))

Como funciona: o servidor lê só as contas de cartão de crédito (`/accounts`, `/v2/transactions`, `/bills`),
cria o cartão no app pelos 4 últimos dígitos se ainda não existir (cartões virtuais e adicionais viram cartões
próprios), coloca cada compra no mês de vencimento da fatura e corrige valores vindos do banco sem mexer na
divisão, categoria e tags que vocês editaram, nem em meses fechados. Para conferir com o banco, use
Ajustes → Open Finance → "Conferir valores com o banco". O app sincroniza sozinho ao abrir
(no máximo a cada 6h) e há um botão em Faturas → Importar. O importador de arquivos continua valendo para
bancos que não estejam no Open Finance.

## Uso do casal no dia a dia

- **Configurações → Pronto para o casal**: checklist do que falta (login dos dois, Drive, primeiro acesso,
  bancos de cada um, cópia semanal, lembretes, instalação no celular).
- **Configurações → Erros do app**: erros da tela e do servidor, guardados criptografados no Drive, sem valores.
  "Copiar erros" gera o texto para mandar para correção.
- **Cópia de segurança semanal** (`/api/cron/copia`, domingo 07:00 UTC, precisa de `CRON_SECRET`).

## Próximos recursos (ideias, aguardando escolha)

Todas seguem as regras do app: somente leitura para dinheiro e sugestões por regras, sem IA.

1. **Notificação no celular (push do próprio app)**: avisos de vencimento e de compra nova sem precisar da Resend.
2. **Objetivos do casal**: viagem, reforma, reserva. Valor alvo, data e quanto já guardaram (marcado à mão).
3. **Dinheiro livre de cada um**: um valor por mês para gastos pessoais, sem o outro ver o detalhe, só se estourou.
4. **Compra surpresa**: marcar uma compra como presente; ela fica escondida do outro até a data escolhida.
5. **Calendário de vencimentos**: mês em forma de calendário com faturas, contas fixas e parcelas que acabam.
6. **Retrospectiva do mês e do ano**: ao fechar o mês, um resumo com maiores gastos, categorias que subiram e
   quanto cada um pagou.
7. **Lista de desejos compartilhada**: itens com preço e prioridade, e o app mostra em que mês cabe na meta.
8. **Divisão pela renda, automática**: a divisão padrão se ajusta sozinha à proporção dos salários cadastrados.

## Segurança (resumo)

- Somente 2 contas Google conseguem entrar; toda rota de API revalida a sessão no servidor.
- Dados financeiros só saem do servidor criptografados (AES-256-GCM). O service worker não guarda respostas da API.
- Nenhum número completo de cartão é aceito (validação exige 4 dígitos).
- Nenhuma funcionalidade de pagamento, Pix ou transferência existe no código.

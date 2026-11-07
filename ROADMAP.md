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

Mais ideias, da revisão de 06/11/2026 (sem repetir as de cima):

9. **Alerta de cobrança estranha**: mesma loja e mesmo valor duas vezes no mesmo dia, ou valor muito acima do normal naquela loja.
10. **Assinatura que subiu de preço** avisada no dia em que a cobrança chega (hoje só aparece em Metas).
11. **Saldo do ano no acerto**: o histórico de meses fechados já existe; falta somar o ano e marcar "acerto feito" (só a marca, como o "Já paguei").
12. **Reembolso de terceiros**: compra que um amigo ou a família vai devolver fica fora da conta do casal até voltar.
13. **Gasto em dinheiro ou Pix** lançado rápido, que entra no acerto sem ser do cartão.
14. **Etiquetas de evento** ("viagem Gramado", "casamento") para somar gastos de vários cartões.
15. **Simular compra parcelada**: "um sofá em 10x de R$ 400" mostra como ficam os próximos meses e a meta.
16. **Comparar com o mesmo mês do ano passado** (dezembro com dezembro).
17. **Comprovante e garantia na compra**: foto guardada no Drive e lembrete "a garantia acaba em março".
18. **Tema escuro** no app (hoje só a tela de carregamento tem).

### O que eu faria primeiro

1. **Corrigir os bugs B1 a B6** (logo abaixo), num PR só. Os números da tela Início ficam confiáveis.
2. **Objetivos do casal** (2): o app passa de "para onde foi" para "para onde vai".
3. **Alerta de cobrança estranha** (9): protege o dinheiro de vocês só com dados que já chegam do banco.
4. **Retrospectiva do mês e do ano** (6): rápida, usa só o que já está salvo.
5. **Notificação no celular** (1): avisos sem abrir o app nem configurar e-mail.

Como adicionar cada um: uma conversa e um PR por recurso; tela nova passa primeiro pelo canvas de design para
comentar; cada regra nova ganha teste em `apps/web/src/lib/engines`; nada muda nos dados salvos sem cópia antes.
Depois de juntar, marcar o item aqui.

## Bugs conhecidos (revisão de 06/11/2026)

Conferido no código da `main` depois do PR #42: 148 testes e checagem de tipos passando, todas as telas abertas no
computador e no celular sem erro no console, e leitura da lógica de contas, faturas, acerto, banco e lembretes.

| # | Gravidade | O que acontece | Onde |
| --- | --- | --- | --- |
| B1 | Alta | **A fatura em aberto ignora as parcelas que já existem.** Enquanto o banco não traz nada do mês, o cartão conta R$ 0. O gráfico de evolução afunda justo no mês atual e o mês seguinte aparece maior. | `lib/engines/overview.ts` (`cardTxsFor`) |
| B2 | Alta | **A nota de saúde fica alta demais por causa do B1.** "Parcelas futuras" mostra 0% e a nota "sobe" sem motivo (na demonstração: 100, "subiu 39 pontos"). | `lib/client/derived.ts` (`nextInstallments`) |
| B3 | Média | **"Contas pagas em dia" ignora boletos e contas vencidas.** Com aluguel vencido e sem "Já paguei", continua 100%. Só olha as faturas de cartão do mês anterior. | `lib/engines/overview.ts` (`billsPaidRatio`) |
| B4 | Média | **A compra feita à mão entra no mês que está na tela**, não na fatura da data escolhida. Se esse mês estiver fechado, dá erro e a tela recarrega. | `components/faturas/manual-purchase.tsx` |
| B5 | Baixa | **Data errada à noite.** Depois das 21h, a compra feita à mão já vem com a data de amanhã, e "Hoje/Ontem" na lista de compras erra (usa o horário de Londres). | `manual-purchase.tsx`, `purchases.tsx` (`dayLabel`) |
| B6 | Baixa | **A sincronização do banco vira o mês pelo horário de Londres.** No último dia do mês, depois das 21h, a janela de meses lida do banco anda um mês antes da hora. | `lib/integrations/pluggy-sync.ts` |
| B7 | Decidido: fica assim | O salário do outro chega no celular junto com os dados do app, sem aparecer na tela. Esconder não protege de verdade: a porcentagem da renda de cada um já permite calcular o valor. | `app/api/state/route.ts` |

Os bugs que vocês acharam usando o app de verdade (Pluggy, Drive) devem aparecer em **Configurações → Erros do app**;
os que não geram erro (número errado, tela estranha) precisam de um print com o nome da tela.

## Antes de usar no dia a dia (fora do checklist do app)

O cartão **Pronto para o casal** cobre login, Drive, bancos, cópia e lembretes. Fica de fora:

- [ ] **Guardar o `ENCRYPTION_SECRET`** num gerenciador de senhas. Sem ele, os dados do Drive ficam ilegíveis para sempre.
- [ ] **Trocar a chave secreta da Pluggy e o token do Drive**, que passaram pelo chat no começo.
- [ ] Apagar o protótipo antigo (`apps/mobile`, `apps/api`, `db/`), que não é usado.
- [ ] O repositório está **público** (para o GitHub Actions ser grátis). Não há senhas no código, mas dá para deixar
      privado se preferirem.

## Segurança (resumo)

- Somente 2 contas Google conseguem entrar; toda rota de API revalida a sessão no servidor.
- Dados financeiros só saem do servidor criptografados (AES-256-GCM). O service worker não guarda respostas da API.
- Nenhum número completo de cartão é aceito (validação exige 4 dígitos).
- Nenhuma funcionalidade de pagamento, Pix ou transferência existe no código.

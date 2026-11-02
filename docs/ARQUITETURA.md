# Corujinha: arquitetura, segurança e regulatório

> Status: proposta inicial (v0.1). Itens marcados com **VERIFICAR** precisam ser confirmados no sandbox ou no contrato do agregador antes de ir para produção.

## 1. O que o app faz (e o que não faz)

**Faz**

- Conecta os cartões de crédito do casal, em qualquer banco participante do Open Finance Brasil.
- Baixa faturas e as transações de cada fatura.
- Mostra o total do mês do casal num lugar só.
- Deixa marcar cada transação como **dividida** ou **não dividida** (de quem é).
- Cadastra **contas fixas** (aluguel, condomínio, internet…), divididas ou não.
- Divide **meio a meio**, **proporcional à renda** ou por **percentual personalizado**.
- Mostra o acerto do mês: quem transfere quanto para quem.

**Não faz, por decisão de projeto**

- Não lê saldo nem extrato de conta corrente.
- Não faz Pix, TED, boleto nem nenhuma iniciação de pagamento.
- Não guarda senha de banco (a autenticação acontece no app do banco, via Open Finance).
- Não guarda número completo de cartão (só os 4 últimos dígitos, quando vierem).

## 2. Visão geral

```
┌─────────────────────┐        HTTPS + JWT         ┌──────────────────────┐
│  App (Expo / RN)    │ ─────────────────────────▶ │  API Corujinha       │
│  iOS + Android      │                            │  (Node + Fastify)    │
│  • Face ID/digital  │ ◀───────────────────────── │  • lista do casal    │
│  • Keychain/Keystore│                            │  • regras de divisão │
│  • Pluggy Connect   │                            │  • só leitura        │
└─────────┬───────────┘                            └───────┬──────┬───────┘
          │ consentimento (redireciona p/ app do banco)    │      │
          ▼                                                ▼      ▼
┌─────────────────────┐   Open Finance Brasil   ┌────────────┐ ┌──────────────┐
│ Bancos do casal     │ ◀─────────────────────▶ │  Pluggy    │ │  Postgres    │
│ (Nubank, Itaú, …)   │                         │ (agregador)│ │  (Supabase)  │
└─────────────────────┘                         └────────────┘ └──────────────┘
```

Monorepo com npm workspaces:

| Pasta | O quê |
| --- | --- |
| `packages/core` | Regras de negócio puras em TypeScript: divisão, fechamento do mês, normalização de faturas. Compartilhado por app e API. 100% testado sem rede. |
| `apps/api` | API Fastify. Única peça que fala com o agregador (as credenciais do agregador nunca vão para o celular). |
| `apps/mobile` | App Expo (React Native) com Expo Router. Um código para iOS e Android. |
| `db/migrations` | Esquema Postgres com Row Level Security. |

## 3. Stack escolhida e por quê

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Mobile | **Expo (React Native) + TypeScript** | Um código para iOS e Android, build na nuvem (EAS) sem precisar de Mac para Android, e o agregador tem SDK oficial para React Native. |
| Agregador Open Finance | **Pluggy** (com interface para trocar por Belvo) | Foco no Brasil, cobertura ampla de bancos, SDK `react-native-pluggy-connect`, e permite restringir os produtos da conexão a `CREDIT_CARDS` + `TRANSACTIONS`. |
| API | **Node + Fastify + Zod** | Mesma linguagem do app, validação forte de entrada, leve. |
| Banco e login | **Supabase** (Postgres + Auth) | Postgres gerenciado com criptografia em repouso, Row Level Security nativa, login por link mágico/OTP e MFA. Plano gratuito cobre duas pessoas folgado. |
| Hospedagem da API | Render, Fly.io ou Railway (região São Paulo quando houver) | Simples, com HTTPS e segredos gerenciados. |

### Pluggy x Belvo

Os dois atendem o caso de uso. A recomendação é a Pluggy pela integração mobile pronta e pelo filtro de produtos na conexão. O código não depende dela: tudo passa pela interface `FinanceProvider` (`apps/api/src/providers/types.ts`), que só tem três operações (gerar token de conexão, ler cartões e faturas, revogar). Trocar de agregador significa escrever um novo arquivo nessa pasta.

Ambos são pagos em produção (há sandbox/trial gratuito para desenvolver). **VERIFICAR** o plano que inclui Open Finance e o custo por conexão ativa.

## 4. Open Finance e regulatório

1. **Quem pode receber dados.** No Open Finance Brasil (regulado pelo Banco Central e pelo CMN), só instituições autorizadas recebem dados diretamente dos bancos. Um app pessoal como o Corujinha não precisa (nem conseguiria facilmente) dessa autorização: ele usa um agregador que atua como receptor, diretamente ou por meio de uma instituição parceira autorizada. **VERIFICAR** no contrato da Pluggy qual instituição aparece para vocês na tela de consentimento do banco.
2. **Consentimento.** Cada um de vocês autoriza no app do próprio banco, escolhendo quais dados compartilhar e por quanto tempo (até 12 meses). Pedimos só o grupo de **cartão de crédito** (faturas, transações e limites). O consentimento pode ser revogado a qualquer momento, no app do banco ou no Corujinha.
3. **Compartilhamento de dados não movimenta dinheiro.** No Open Finance, ler dados e iniciar pagamento (Pix) são permissões separadas, e cada pagamento exige um consentimento próprio, aprovado no app do banco. Um consentimento de leitura de fatura não permite fazer Pix, mesmo que fique ativo.
4. **LGPD.** Para uso exclusivamente particular do casal, sem fins econômicos, a LGPD não se aplica ao tratamento feito por vocês (art. 4º, I). O agregador continua sujeito à LGPD e ao seu contrato. Se um dia o app for oferecido a outras pessoas, passa a valer a LGPD inteira (base legal, política de privacidade, encarregado, direitos do titular) e vale reavaliar o modelo de contratação do agregador.
5. **Lojas de apps.** Para uso de duas pessoas, o caminho é distribuição interna: TestFlight no iOS e teste interno da Play Store no Android. Não é preciso publicar o app abertamente.

## 5. "Não quero que o acesso ao banco fique mantido"

A API tem a configuração `CONSENT_MODE`:

| Modo | Como funciona | Prós | Contras |
| --- | --- | --- | --- |
| `one_shot` (**padrão**) | Conecta, baixa as faturas e apaga a conexão no agregador na hora, o que revoga o consentimento no banco. | Nenhum acesso fica ativo entre um mês e outro. | Todo mês cada um reconecta os cartões (cerca de 1 minuto por banco). |
| `keep` | O consentimento fica ativo até expirar (prazo que vocês escolhem, até 12 meses) ou ser revogado. | Faturas atualizam sozinhas. | Existe um acesso de leitura ativo, ainda que sem poder de pagamento. |

**VERIFICAR** no sandbox que apagar o item na Pluggy revoga de fato o consentimento no banco, e qual o prazo mínimo de consentimento que dá para escolher.

## 6. Segurança

Já no esqueleto:

- **Só duas pessoas.** A API só aceita usuários cuja identidade esteja em `ALLOWED_USER_IDS` (máximo 2, validado na inicialização). Qualquer outra conta autenticada recebe 403. O banco reforça com um trigger que impede um terceiro membro.
- **Login com token verificado.** JWT do provedor de login verificado por assinatura (JWKS), emissor, audiência e expiração.
- **Trava biométrica.** O app pede Face ID, digital ou senha do aparelho ao abrir e quando volta do segundo plano depois de 1 minuto. Enquanto travado, nenhuma fatura é renderizada.
- **Segredos no lugar certo.** Token de sessão no Keychain/Keystore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, fora de backup). Credenciais do agregador só no servidor. `allowBackup: false` no Android.
- **Escopo mínimo.** A conexão pede apenas os produtos `CREDIT_CARDS` e `TRANSACTIONS`. A interface do provedor não tem nenhuma operação de pagamento.
- **API endurecida.** Validação de toda entrada com Zod, cabeçalhos de segurança (helmet), limite de requisições, limite de tamanho do corpo, logs sem cabeçalho de autorização, comparação de segredo em tempo constante.
- **Produção trava configuração insegura.** Em `NODE_ENV=production` a API se recusa a subir com token de desenvolvimento, sem JWKS ou com provedor fictício.
- **Banco de dados.** Row Level Security em todas as tabelas: cada pessoa só enxerga os dados do próprio casal. Trilha de auditoria para conectar, sincronizar e revogar.

Próximos passos de segurança:

- Login Supabase com link mágico ou OTP mais MFA (TOTP ou passkey).
- Bloquear captura de tela nas telas de fatura (`expo-screen-capture`).
- Assinatura e segredo nos webhooks do agregador, se usarmos o modo `keep`.
- Apagar transações antigas automaticamente (ex.: depois de 24 meses).
- Revisão de dependências no CI (`npm audit`, Dependabot).

## 7. Regras de divisão

Implementadas em `packages/core/src/split.ts` e cobertas por testes:

- Tudo em **centavos inteiros**. A divisão usa o método do maior resto, então a soma das partes é sempre exatamente o total (nada de centavo sumindo).
- **Meio a meio**, **proporcional à renda** (ex.: R$ 7.000 e R$ 5.000 dão 58,33% e 41,67%) ou **percentual personalizado**.
- Cada despesa pode usar a regra do casal ou uma regra própria (ex.: aluguel proporcional, mercado meio a meio).
- Despesa **não dividida** é de uma pessoa só, mesmo que tenha sido paga no cartão da outra (ex.: presente comprado no cartão dela para ele).
- **Estornos** entram negativos e são divididos do mesmo jeito.
- O fechamento mostra quanto cada um pagou, a parte justa de cada um, e a transferência que zera a conta.
- Funciona para grupos de mais de duas pessoas, embora o acesso esteja limitado ao casal.

## 8. Roadmap sugerido

1. **Este PR:** esqueleto, regras de divisão, API com Pluggy e provedor fictício, telas principais.
2. Login Supabase e persistência Postgres (trocar `MemoryStore`).
3. Teste ponta a ponta no sandbox da Pluggy e ajuste dos campos marcados com VERIFICAR.
4. Regras automáticas ("tudo da categoria Mercado é dividido"), histórico de meses, e marcar o acerto como pago.
5. Build interno (TestFlight e teste interno da Play Store) para vocês dois.

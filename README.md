# Corujinha 🦉

As faturas de cartão do casal num só lugar, com a divisão das contas de casa clara e transparente.

- Busca faturas e transações de cartão de crédito de todos os bancos via **Open Finance** (somente leitura, sem Pix nem pagamentos).
- Marca o que é dividido e o que é de cada um.
- Contas fixas (aluguel, condomínio, internet…).
- Divisão meio a meio, proporcional à renda ou por percentual.
- Acesso restrito a duas pessoas, com trava biométrica.

Arquitetura, segurança e regulatório: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Estrutura

```
packages/core   regras de divisão e modelos (TypeScript puro, testado)
apps/api        API Fastify (fala com o agregador Pluggy)
apps/mobile     app Expo / React Native (iOS e Android)
db/migrations   esquema Postgres com Row Level Security
```

## Rodando localmente

Requisitos: Node 22+.

```bash
npm install
npm test          # testes de core e api
npm run typecheck
```

**API** (com dados fictícios, sem precisar de conta na Pluggy):

```bash
cp apps/api/.env.example apps/api/.env
# edite: ALLOWED_USER_IDS=bruno,esposa e DEV_AUTH_TOKEN=um-segredo-qualquer
npm run dev:api
```

**App**:

```bash
cp apps/mobile/.env.example apps/mobile/.env
npm run dev:mobile
```

O app usa módulos nativos (biometria, Keychain, WebView do Pluggy), então rode num
[development build](https://docs.expo.dev/develop/development-builds/introduction/)
(`npx expo run:android` / `npx expo run:ios`, ou `npx eas-cli build --profile development`).
No login provisório, informe o `DEV_AUTH_TOKEN` e seu ID (ex.: `bruno`).

Para dados reais, crie uma conta na [Pluggy](https://pluggy.ai), use `FINANCE_PROVIDER=pluggy`
e preencha `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET`.

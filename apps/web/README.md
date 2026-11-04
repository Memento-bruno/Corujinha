# Corujinha · app web (PWA)

Faturas de cartão do casal num só lugar, divisão por item, encontro de contas e sugestões de corte por regras.
Somente leitura: o app nunca faz pagamentos, Pix ou transferências.

```bash
npm install          # na raiz do repositório
npm run dev          # http://localhost:3000 (modo demo, sem credenciais)
npm test -w @corujinha/web
```

Sem `.env.local`, o app abre em **modo demo**: sem login, com 6 meses de faturas fictícias em `apps/web/.data/demo/`.
Para dados reais, copie `.env.example` para `.env.local` e siga o [ROADMAP](../../ROADMAP.md).

## Estrutura

```
src/lib/domain      tipos, categorias, dinheiro (centavos), meses
src/lib/engines     settlement.ts (encontro de contas), savings.ts (RuleBasedSavingsEngine), analytics.ts
src/lib/importers   CSV, OFX e PDF (leitura no servidor) + normalização de estabelecimentos
src/lib/server      DriveDatabaseService, Drive/local store com ETag, AES-256-GCM, env, sessão
src/lib/demo        dados de demonstração determinísticos
src/app             páginas (Home, Faturas, Acerto, Cortes, Ajustes) e rotas de API
samples/            arquivos de exemplo para testar o importador
```

## Dados no Google Drive

Uma única pasta (`GOOGLE_DRIVE_FOLDER_ID`) compartilhada pelo casal, com arquivos JSON criptografados:

- `household-config.json`: perfis, cartões (4 últimos dígitos), divisão padrão, meta e tetos por setor
- `recurring-debts.json`: contas fixas, financiamentos e parcelamentos fora do cartão
- `statements-YYYY-MM.json`: transações do mês, divisões, tags e o snapshot de fechamento

Cada gravação manda o ETag (versão do arquivo no Drive) lido antes; se o outro aparelho gravou no meio
tempo, a gravação é recusada (HTTP 409) e a tela recarrega a versão nova.

## Modo Privacidade

O botão `R$ / %` no topo troca todos os valores por percentuais (da fatura, da meta, do teto). Nenhum `R$` aparece na tela.

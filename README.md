# finance

Monorepo de finanças pessoais.

## Estrutura

- `app/` — React 19 + TypeScript + Vite (frontend)
- `api/` — Elysia + Bun + Drizzle ORM (backend)

## Setup

```bash
docker compose up -d              # PostgreSQL na porta 5435
cp api/.env.example api/.env      # ajuste as variáveis (ver abaixo)
cd api && bun install && bun run db:push
cd .. && bun install
bun run dev                       # sobe api + app juntos
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

### Comandos úteis

```bash
bun run dev            # api + app (raiz)
cd api && bun test     # testes do backend
cd api && bunx tsc --noEmit --moduleResolution bundler   # typecheck
cd app && bun run typecheck && bun run lint
```

## Open Finance (somente leitura)

Integração de **leitura** de contas, saldos e transações via provedor agregador
regulado (**Pluggy**). Sem pagamentos, Pix, iniciação de transação ou
compartilhamento com terceiros. As transações manuais e as importadas por CSV
**não são alteradas** — os dados externos ficam em tabelas `open_finance_*`.

Decisão do provedor: [`docs/open-finance-decision.md`](docs/open-finance-decision.md).
Detalhes: `.claude/docs/{domain,api,frontend}/open-finance.md`.

### Variáveis (`api/.env`)

| Var | Default | Descrição |
|---|---|---|
| `OPEN_FINANCE_PROVIDER` | `pluggy` | `pluggy` (real/sandbox) ou `mock` (dados falsos, sem rede) |
| `PLUGGY_CLIENT_ID` | — | Client ID da app Pluggy (dashboard.pluggy.ai) |
| `PLUGGY_CLIENT_SECRET` | — | Client Secret da app Pluggy |
| `PLUGGY_BASE_URL` | `https://api.pluggy.ai` | Override da URL base |
| `OPEN_FINANCE_DEFAULT_CONNECTOR_ID` | `2` | Conector padrão ao criar conexão pelo backend (`2` = Pluggy Bank sandbox) |
| `OPEN_FINANCE_WEBHOOK_URL` | vazio | URL pública repassada à Pluggy ao criar o item (túnel local) |
| `OPEN_FINANCE_WEBHOOK_SECRET` | vazio | Se definido, `POST /open-finance/webhooks` exige `x-webhook-secret` |

`PLUGGY_CLIENT_ID/SECRET` são usados **apenas no backend** para gerar o
`X-API-KEY` de curta duração. Nunca vão ao frontend.

### Usar o sandbox

Sem credenciais Pluggy, rode com `OPEN_FINANCE_PROVIDER=mock` para ter contas e
transações fictícias e exercitar todo o fluxo (conectar → sincronizar → listar).

Com credenciais Pluggy e `OPEN_FINANCE_PROVIDER=pluggy`, o connector `2`
("Pluggy Bank") aceita as credenciais de teste da documentação da Pluggy
(ex.: usuário `user-ok`, senha `password-ok`).

### Conectar uma conta

1. Abra **Open Finance** no menu lateral → **Nova conexão**.
2. **Opção A (recomendada em produção):** cole o `Item ID` gerado pelo widget
   Pluggy Connect.
3. **Opção B (sandbox/testes):** informe o `Connector ID` (`2`) e as credenciais
   de teste em usuário/senha.
4. Salvar dispara a **sincronização inicial** automaticamente.

Via API:

```bash
# sandbox pelo backend
curl -X POST http://localhost:3001/open-finance/connections \
  -H 'content-type: application/json' \
  -d '{"connectorId":"2","parameters":{"user":"user-ok","password":"password-ok"}}'
```

### Sincronizar transações

- Manual: botão **Sincronizar** na página, ou
  `POST /open-finance/connections/:id/sync`.
- Automática: configure o webhook do provedor apontando para
  `POST /open-finance/webhooks` (use um túnel como `cloudflared`/`ngrok` em
  ambiente local). A sincronização roda em background ao receber o evento.
- A sincronização é **incremental** (rebaixa os últimos 5 dias) e **idempotente**
  (dedupe pelo identificador original da transação).

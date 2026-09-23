---
title: Sondagem da Pluggy (F0 do Open Finance)
area: infra
updated: 2026-09-23
---

## Visão geral

`bun run pluggy:probe` (em `api/`, arquivo `api/scripts/pluggy-probe.ts`) é a F0
do plano de Open Finance: lê a conta Meu Pluggy real e responde as perguntas que
definem o schema e o sync das próximas fases. **Somente leitura**: só chama `GET`
na Pluggy (e o `POST /auth`) e só faz `SELECT` no banco.

## Configuração (`api/.env`)

| Variável | Obrigatória | O que é |
|---|---|---|
| `PLUGGY_CLIENT_ID` | sim | Client ID da aplicação demo do Meu Pluggy |
| `PLUGGY_CLIENT_SECRET` | sim | Client Secret da mesma aplicação |
| `PLUGGY_ITEM_IDS` | sim | IDs das conexões (items), separados por vírgula |
| `PLUGGY_BASE_URL` | não | Default `https://api.pluggy.ai` |

As credenciais só existem no backend. O script nunca as imprime.

## O que ele reporta

1. **Items e contas:** conector, status, última atualização, tipo/subtipo,
   número mascarado, saldo e volume de transações por conta.
2. **Convenção de sinal:** contagem por `tipo de conta × type × sinal de amount`.
   Na doc da Pluggy o cartão usa positivo = compra, e a conta corrente usa
   negativo = saída. É o que define a normalização para o domínio (positivo =
   despesa).
3. **Status:** `PENDING` × `POSTED`.
4. **Enriquecimento:** preenchimento de `category`, `providerId`, `merchant`,
   `creditCardMetadata` (parcelas) e `paymentData`, mais as categorias mais comuns.
5. **Janela real de histórico:** pede 12 meses, que é o máximo da Pluggy.
6. **Conciliação com o CSV:** das transações de contas `BANK`, quantas casam com
   as linhas já importadas na conta Nubank, primeiro por identificador
   (`providerId`/`id` × Identificador do extrato) e depois por data + valor.

## Saída

- Resumo no stdout.
- Payload bruto em `api/tmp/pluggy-probe.json`. **Não versionar**: é extrato
  bancário. `api/tmp/` está no `.gitignore`.

## Endpoints usados

`POST /auth`, `GET /items/{id}`, `GET /accounts?itemId=`,
`GET /v2/transactions?accountId=&dateFrom=&after=` (cursor, 500 por página).

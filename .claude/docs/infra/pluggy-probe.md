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

## Resultados da primeira execução (2026-09-23)

**Conexão:** 1 item, `Nubank` (conector 612, Open Finance), `UPDATED`.
`consentExpiresAt` e `nextAutoSyncAt` vieram nulos: o Meu Pluggy gerencia a
renovação. O item expõe os produtos ACCOUNTS, CREDIT_CARDS, TRANSACTIONS,
INVESTMENTS, IDENTITY, INVESTMENTS_TRANSACTIONS, PAYMENT_DATA, BROKERAGE_NOTE
e LOANS.

| Conta Pluggy | Tipo | Transações (12 meses) | Saldo |
|---|---|---|---|
| Nu Pagamentos (conta corrente) | `BANK/CHECKING_ACCOUNT` | 511 | R$ 773,86 |
| croma-platinum (cartão final 3962 + 7 adicionais/virtuais) | `CREDIT/CREDIT_CARD` | 969 | R$ 11.130,74 usados de R$ 13.500 |

### Sinal

| Conta | `type` | Sinal de `amount` | Quantidade |
|---|---|---|---|
| BANK | DEBIT | negativo | 387 |
| BANK | CREDIT | positivo | 124 |
| CREDIT_CARD | DEBIT | positivo | 955 |
| CREDIT_CARD | CREDIT | negativo | 14 |

O sinal se inverte entre conta e cartão, mas o `type` é consistente nos dois.
Normalização para o domínio: `amount = type === "DEBIT" ? +|v| : -|v|`.

### Data: é UTC

`date` vem em ISO UTC (`2026-08-24T00:46:16Z`). Um Pix feito à noite no
horário de Brasília cai no dia seguinte. **Converter para `America/Sao_Paulo`**
antes de gravar.

### Status

Só o cartão tem `PENDING`: são 86 transações.
- 57 com data passada: compras da fatura aberta, gasto real.
- 29 com data futura (até 2027-07): **parcelas futuras**, com
  `creditCardMetadata.installmentNumber/totalInstallments/billForecastDate`.
  Não são gasto realizado, mas servem de compromisso conhecido na projeção.

### Enriquecimento

| Campo | Preenchido |
|---|---|
| `category` / `categoryId` | 100%: taxonomia hierárquica da Pluggy, 53 categorias (ex.: `11010000` Eating out) |
| `creditCardMetadata` | 100% do cartão: parcelas, MCC e final do cartão |
| `paymentData` | 100% da conta: CPF/CNPJ do recebedor |
| `merchant` | 0% |
| `providerId` | 0% |

### Movimentos internos (risco de contar em dobro)

- **Fatura:** 12 × "Pagamento de fatura" na conta (R$ 4,1k a 5,7k por mês)
  espelhadas por "Pagamento recebido" no cartão, com categoria
  `Credit card payment` / `Transfers`. Com as compras do cartão entrando uma a
  uma, a fatura precisa sair das métricas.
- **Investimentos/RDB:** "Aplicação RDB", "Resgate RDB" e "Valor recebido de
  Investimentos" (categoria `Investments`, 184 transações) e
  `Same person transfer` (22). São dinheiro mudando de lugar, não gasto nem renda.

### Conciliação com o histórico CSV

Não há identificador comum: `providerId` vem vazio e o `id` da Pluggy não é o
Identificador do extrato.

| Chave | CSV casado (327 linhas, nov/25–ago/26) |
|---|---|
| data UTC + valor | 294 (90%) |
| **data em São Paulo + valor** | **323 (99%)** |

Das transações da Pluggy sem par na janela, a maioria são micro-movimentos de
RDB que o CSV não traz. Também faltam no banco os Pix de **março/2026**: o
extrato de março nunca foi importado, e o Open Finance fecha esse buraco.

### Descrições diferem do CSV

| Pluggy | CSV |
|---|---|
| `Transferência enviada\|NOME` | `Transferência enviada pelo Pix - NOME - CPF - BANCO` |

As regras de classificação (`seed-rules.ts`, `normalize.ts`) foram escritas
para o texto do CSV e precisam de padrões equivalentes para o da Pluggy.

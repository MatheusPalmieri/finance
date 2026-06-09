---
title: Sistema de Phase + CloseReason + Timestamps de Transição
area: decisions
updated: 2026-06-08

---

## Visão geral

O campo `status` atual faz dois trabalhos ao mesmo tempo: indica **onde o cliente está no funil** e **qual foi o resultado final**. Isso dificulta queries de pipeline, métricas de ciclo de vendas e a leitura visual do progresso.

A solução proposta separa esses dois conceitos em campos distintos e adiciona timestamps automáticos para cada transição de fase, permitindo medir velocidade de avanço no funil.

---

## Problema atual

| Status atual | Papel real |
|---|---|
| `NOT_STARTED`, `MESSAGE_SENT` | Posição no funil (To Do) |
| `NEGOTIATING` | Posição no funil (In Progress) |
| `HAS_SYSTEM`, `TRIAL`, `CUSTOM_TRIAL`, `REJECTED`, `DISLIKED`, `NO_RESPONSE`, `INVALID_CONTACT` | Resultado final (Done) |

Um único campo não consegue expressar "está negociando e a mensagem foi enviada há X dias" sem duplicar estado ou fazer queries complexas.

---

## Proposta: `phase` + `closeReason`

### `phase` (obrigatório)

```
PROSPECTING   → cliente adicionado, mensagem ainda não gerou resposta
NEGOTIATING   → em negociação ativa
CLOSED        → encerrado (positivo ou negativo)
```

Mapeia diretamente para a visão de kanban/funil:

| Phase | Equivalente atual |
|---|---|
| `PROSPECTING` | `NOT_STARTED`, `MESSAGE_SENT` |
| `NEGOTIATING` | `NEGOTIATING` |
| `CLOSED` | todos os demais |

### `closeReason` (nullable — só preenchido quando `phase = CLOSED`)

**Positivos (won):**

| Valor | Significado |
|---|---|
| `CLIENT` | Virou cliente pagante |
| `TRIAL` | Entrou em trial padrão (estado final) |
| `CUSTOM_TRIAL` | Entrou em trial customizado (estado final) |

**Negativos (lost):**

| Valor | Significado |
|---|---|
| `PRICE_OBJECTION` | Não fechou por preço ou concorrência |
| `NO_FIT` | Não gostou / produto não se encaixa |
| `GHOST` | Sumiu durante o processo de negociação |
| `UNREACHABLE` | Contato inválido / número errado |

> `GHOST` e `UNREACHABLE` indicam clientes potencialmente re-engajáveis no futuro — diferente de `PRICE_OBJECTION` ou `NO_FIT` que foram decisões ativas do lead.

---

## Timestamps de transição de fase

Para medir velocidade e gerar métricas de funil, cada transição de fase ganha um timestamp dedicado na tabela `clients`:

| Coluna | Quando é preenchido | O que mede |
|---|---|---|
| `createdAt` | Já existe — criação do registro | Entrada no pipeline |
| `messageSentAt` | Quando `status` era `MESSAGE_SENT` (dentro do PROSPECTING) | Tempo até primeiro contato |
| `negotiatingStartedAt` | Quando `phase` muda para `NEGOTIATING` | Início da negociação ativa |
| `closedAt` | Quando `phase` muda para `CLOSED` | Encerramento do ciclo |

### Métricas derivadas

```
Tempo até 1º contato     = messageSentAt - createdAt
Tempo de prospecção      = negotiatingStartedAt - createdAt
Tempo de negociação      = closedAt - negotiatingStartedAt
Ciclo completo           = closedAt - createdAt
Taxa de conversão        = COUNT(closeReason = 'CLIENT') / COUNT(phase = CLOSED)
Taxa de trial            = COUNT(closeReason IN ('TRIAL', 'CUSTOM_TRIAL')) / COUNT(phase = CLOSED)
Taxa de perda ativa      = COUNT(closeReason IN ('PRICE_OBJECTION', 'NO_FIT')) / COUNT(phase = CLOSED)
Taxa de perda passiva    = COUNT(closeReason IN ('GHOST', 'UNREACHABLE')) / COUNT(phase = CLOSED)
```

### Responsabilidade de preenchimento

Os timestamps são preenchidos pela API no momento da transição — nunca pelo cliente. O frontend só envia a mudança de `phase` (e `closeReason` quando aplicável); a API resolve qual timestamp atualizar.

---

## Schema proposto (Drizzle)

```ts
// Novos enums
export const clientPhaseEnum = pgEnum("client_phase", [
  "PROSPECTING",
  "NEGOTIATING",
  "CLOSED",
])

export const closeReasonEnum = pgEnum("close_reason", [
  // won
  "CLIENT",
  "TRIAL",
  "CUSTOM_TRIAL",
  // lost
  "PRICE_OBJECTION",
  "NO_FIT",
  "GHOST",
  "UNREACHABLE",
])

// Novos campos na tabela clients
phase: clientPhaseEnum("phase").default("PROSPECTING").notNull(),
closeReason: closeReasonEnum("close_reason"),          // nullable
messageSentAt: timestamp("message_sent_at"),           // nullable
negotiatingStartedAt: timestamp("negotiating_started_at"), // nullable
closedAt: timestamp("closed_at"),                      // nullable
```

> O campo `status` atual pode ser **mantido temporariamente** durante a migração e depois removido, ou migrado de uma vez se não houver dados em produção ainda.

---

## Impacto nos endpoints

| Endpoint atual | Mudança |
|---|---|
| `PATCH /clients/:id/status` | Renomear para `PATCH /clients/:id/phase`, aceitar `{ phase, closeReason? }` |
| `GET /clients` | Aceitar `?phase=` além de (ou no lugar de) `?status=` |
| `POST /clients` | `phase` opcional (default `PROSPECTING`), sem `status` |
| `PUT /clients/:id` | Remover `status` do body, não alterar `phase` aqui |

---

## Impacto no frontend

- `StatusModal` → vira `PhaseModal` com seletor de `phase` + campo condicional de `closeReason`
- `CLIENT_STATUS_LABELS` / `CLIENT_STATUS_HEX` → substituídos por mapas equivalentes para `phase` e `closeReason`
- Página Funnel → usa `phase` como agrupador principal, `closeReason` como detalhe no `CLOSED`

---

## Migração de dados

```sql
-- Script de migração sugerido (dev — sem dados reais ainda)
UPDATE clients SET
  phase = CASE
    WHEN status IN ('NOT_STARTED', 'MESSAGE_SENT') THEN 'PROSPECTING'
    WHEN status = 'NEGOTIATING' THEN 'NEGOTIATING'
    ELSE 'CLOSED'
  END,
  close_reason = CASE
    WHEN status = 'HAS_SYSTEM'       THEN 'CLIENT'
    WHEN status = 'TRIAL'            THEN 'TRIAL'
    WHEN status = 'CUSTOM_TRIAL'     THEN 'CUSTOM_TRIAL'
    WHEN status = 'REJECTED'         THEN 'PRICE_OBJECTION'
    WHEN status = 'DISLIKED'         THEN 'NO_FIT'
    WHEN status = 'NO_RESPONSE'      THEN 'GHOST'
    WHEN status = 'INVALID_CONTACT'  THEN 'UNREACHABLE'
    ELSE NULL
  END,
  message_sent_at = CASE
    WHEN status = 'MESSAGE_SENT' THEN updated_at
    ELSE NULL
  END;
```

---

## Status desta decisão

**IMPLEMENTADO** — 2026-06-08. Schema migrado, API atualizada, frontend refatorado.

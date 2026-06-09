---
title: Entidade Client
area: domain
updated: 2026-06-08
---

## Visão geral

`Client` é a entidade central do CRM. Representa uma empresa ou pessoa prospectada para venda. Todo o fluxo de funil gira em torno desta entidade.

## Campos

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | sim | Gerado automaticamente |
| `name` | varchar(255) | sim | Nome do cliente |
| `phoneAreaCode` | varchar(2) | sim | DDD (ex: "11") |
| `phoneNumber` | varchar(8) | sim | 8 dígitos, sem o 9 inicial |
| `responsiblePhoneAreaCode` | varchar(2) | não | DDD do responsável |
| `responsiblePhoneNumber` | varchar(8) | não | Telefone do responsável (8 dígitos) |
| `city` | varchar(255) | sim | Cidade |
| `phase` | ClientPhase | sim | Posição no funil (default: `PROSPECTING`) |
| `closeReason` | CloseReason | não | Motivo de fechamento (só quando `phase = CLOSED`) |
| `messageSentAt` | timestamp | não | Quando a primeira mensagem foi enviada |
| `negotiatingStartedAt` | timestamp | não | Quando entrou em negociação |
| `closedAt` | timestamp | não | Quando foi fechado |
| `deletedAt` | timestamp | não | Preenchido no soft delete |
| `createdAt` | timestamp | sim | Gerado automaticamente |
| `updatedAt` | timestamp | sim | Atualizado automaticamente |

## Regra do telefone

Números celulares brasileiros pós-2012 têm um "9" adicional (ex: `11 9 9999-9999`). Algumas automações externas não aceitam esse formato e exigem apenas 8 dígitos.

**Regra:** ao salvar, o backend chama `normalizePhone()` que remove o 9 inicial se o número tiver 9 dígitos e começar com "9". O banco sempre armazena 8 dígitos.

```
entrada: "987654321"  →  armazenado: "87654321"
entrada: "87654321"   →  armazenado: "87654321"
```

Telefones **não são únicos** — duplicatas são permitidas mas sinalizadas via `hasDuplicate: boolean` no GET /clients.

## Fase do funil (ClientPhase)

| Valor | Label | Descrição |
|-------|-------|-----------|
| `PROSPECTING` | Prospecção | Adicionado, pode ter mensagem enviada |
| `NEGOTIATING` | Negociando | Em negociação ativa |
| `CLOSED` | Fechado | Encerrado (positivo ou negativo) |

## Motivo de fechamento (CloseReason)

Preenchido apenas quando `phase = CLOSED`.

**Ganhos (won):**

| Valor | Label |
|-------|-------|
| `CLIENT` | Cliente |
| `TRIAL` | Trial |
| `CUSTOM_TRIAL` | Trial customizado |

**Perdidos (lost):**

| Valor | Label |
|-------|-------|
| `PRICE_OBJECTION` | Objeção de preço |
| `NO_FIT` | Sem fit |
| `GHOST` | Ghost |
| `UNREACHABLE` | Inacessível |

> `GHOST` e `UNREACHABLE` indicam clientes potencialmente re-engajáveis; `PRICE_OBJECTION` e `NO_FIT` foram decisões ativas do lead.

## Timestamps de transição

Preenchidos automaticamente pela API em `PATCH /clients/:id/phase`:

| Timestamp | Quando é preenchido |
|-----------|---------------------|
| `messageSentAt` | Quando `messageSent: true` é enviado (só na primeira vez) |
| `negotiatingStartedAt` | Na primeira transição para `NEGOTIATING` |
| `closedAt` | Na primeira transição para `CLOSED` |

**Métricas derivadas:**
```
Tempo até 1º contato  = messageSentAt - createdAt
Tempo de prospecção   = negotiatingStartedAt - createdAt
Tempo de negociação   = closedAt - negotiatingStartedAt
Ciclo completo        = closedAt - createdAt
```

## Soft delete

Clientes nunca são removidos do banco. `DELETE /clients/:id` preenche `deletedAt`. Todas as queries filtram `WHERE deleted_at IS NULL`.

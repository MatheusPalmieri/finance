---
title: API — Clientes
area: api
updated: 2026-06-08
---

## Visão geral

Todos os endpoints de clientes estão no plugin Elysia em `api/src/routes/clients.ts`, montado sob o prefixo `/clients`. A validação de corpo/query usa `t` do Elysia (TypeBox).

## Endpoints

### GET /clients

Lista clientes ativos (soft-delete excluído) com paginação e filtros.

**Query params:**

| Param | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `page` | string | `"1"` | Página atual |
| `limit` | string | `"20"` | Itens por página |
| `search` | string | — | Busca ilike em `name` e `city` |
| `phase` | string | — | Filtra por `ClientPhase` exato |
| `duplicates` | `"true"` | — | Retorna só clientes com telefone duplicado |

**Resposta:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "...",
      "phoneAreaCode": "11",
      "phoneNumber": "99999999",
      "responsiblePhoneAreaCode": null,
      "responsiblePhoneNumber": null,
      "city": "...",
      "phase": "PROSPECTING",
      "closeReason": null,
      "messageSentAt": null,
      "negotiatingStartedAt": null,
      "closedAt": null,
      "hasDuplicate": false,
      "deletedAt": null,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": { "total": 100, "page": 1, "limit": 20 }
}
```

O campo `hasDuplicate` é calculado via subquery SQL em tempo real — não persiste no banco.

---

### GET /clients/stats

Agrega métricas para o dashboard do **Funil de vendas** (`/funnel`). Filtra por período (via `createdAt`) e cidade. Definido **antes** de `/:id` na rota para a rota estática ter precedência sobre a paramétrica.

**Query params:**

| Param | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `period` | `"7d" \| "30d" \| "90d" \| "all"` | `"30d"` | Janela de `createdAt`; `all` ignora o filtro de data |
| `city` | string | — | Filtra por cidade exata |

**Resposta:**

```json
{
  "total": 50,
  "phaseCounts": { "PROSPECTING": 20, "NEGOTIATING": 10, "CLOSED": 20 },
  "closeReasonCounts": { "CLIENT": 5, "TRIAL": 3, "PRICE_OBJECTION": 8 },
  "contacted": 35,
  "byCity": [{ "city": "Florianópolis", "count": 5 }],
  "timeline": [{ "date": "2026-06-08", "count": 50 }],
  "cities": ["Balneário Camboriú", "Blumenau"]
}
```

- `phaseCounts` — sempre traz as 3 chaves do enum (zeradas quando sem registros)
- `closeReasonCounts` — só traz chaves com count > 0 (parcial)
- `contacted` — count de clientes com `messageSentAt IS NOT NULL`
- `byCity` — top 8 cidades por contagem, ordem decrescente
- `timeline` — leads criados por dia (`YYYY-MM-DD`), só dias com registros; o frontend preenche os dias vazios para um eixo contínuo

---

### POST /clients

Cria um cliente. O backend normaliza `phoneNumber` (remove 9 inicial se 9 dígitos). Fase inicial sempre `PROSPECTING`.

**Body:**

```json
{
  "name": "string (min 1)",
  "phoneAreaCode": "string (1-3 chars, só dígitos)",
  "phoneNumber": "string (7-11 chars, só dígitos)",
  "city": "string (min 1)"
}
```

**Resposta:** objeto `Client` criado.

---

### GET /clients/:id

Retorna um cliente por ID. Retorna 404 se não encontrado ou deletado.

---

### PUT /clients/:id

Atualiza campos gerais (nome, telefone, cidade). Não altera fase nem responsável.

**Body:** mesmo schema do POST.

---

### PATCH /clients/:id/phase

Atualiza a fase do cliente e define automaticamente os timestamps de transição.

**Body:**
```json
{
  "phase": "NEGOTIATING",
  "closeReason": "CLIENT",
  "messageSent": true
}
```

- `closeReason` — obrigatório quando `phase = "CLOSED"`, ignorado nas demais
- `messageSent` — opcional; quando `true` e `messageSentAt` ainda é null, preenche `messageSentAt = now()`

**Timestamps automáticos:**

| Transição | Timestamp preenchido |
|-----------|---------------------|
| `→ NEGOTIATING` (primeira vez) | `negotiatingStartedAt` |
| `→ CLOSED` (primeira vez) | `closedAt` |
| `messageSent = true` (primeira vez) | `messageSentAt` |

---

### PATCH /clients/:id/responsible

Adiciona ou atualiza o telefone do responsável. Normaliza o número igual ao telefone principal.

**Body:**
```json
{
  "responsiblePhoneAreaCode": "11",
  "responsiblePhoneNumber": "988887777"
}
```

---

### DELETE /clients/:id

Soft delete — preenche `deletedAt`. Retorna `{ "success": true }`.

## Utilitário de telefone

`api/src/lib/phone.ts`:

- `normalizePhone(raw)` — remove caracteres não numéricos; se 9 dígitos e começa com "9", retira o primeiro dígito
- `formatPhone(areaCode, number)` — retorna `"(11) 9999-9999"` para exibição

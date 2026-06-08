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
| `status` | string | — | Filtra por `ClientStatus` exato |
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
      "status": "NOT_STARTED",
      "hasDuplicate": false,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": { "total": 100, "page": 1, "limit": 20 }
}
```

O campo `hasDuplicate` é calculado via subquery SQL em tempo real — não persiste no banco.

---

### POST /clients

Cria um cliente. O backend normaliza `phoneNumber` (remove 9 inicial se 9 dígitos).

**Body:**

```json
{
  "name": "string (min 1)",
  "phoneAreaCode": "string (1-3 chars, só dígitos)",
  "phoneNumber": "string (7-11 chars, só dígitos)",
  "city": "string (min 1)",
  "status": "ClientStatus (opcional)"
}
```

**Resposta:** objeto `Client` criado.

---

### GET /clients/:id

Retorna um cliente por ID. Retorna 404 se não encontrado ou deletado.

---

### PUT /clients/:id

Atualiza campos gerais (nome, telefone, cidade). Não altera status nem responsável.

**Body:** mesmo schema do POST (sem `status`).

---

### PATCH /clients/:id/status

Atualiza apenas o status do cliente.

**Body:**
```json
{ "status": "NEGOTIATING" }
```

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

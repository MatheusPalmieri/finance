---
title: ADR — Normalização de telefone (remoção do 9 inicial)
area: decisions
updated: 2026-06-08
---

## Contexto

Números celulares brasileiros ganharam um dígito adicional "9" em 2012 (ex: `(11) 9 9999-9999`). Uma automação externa integrada ao CRM exige o formato de 8 dígitos sem esse 9 inicial.

## Decisão

- O banco armazena **sempre 8 dígitos** em `phone_number` e `responsible_phone_number`
- A normalização ocorre **no backend** (`api/src/lib/phone.ts`) nos endpoints POST, PUT e PATCH /responsible
- O frontend envia o número como o usuário digitou (8 ou 9 dígitos); o backend normaliza
- Telefones **não são únicos** — mesma combinação DDD+número pode aparecer em múltiplos clientes
- Duplicatas são detectadas em tempo real via subquery SQL no GET /clients e sinalizadas com `hasDuplicate: true`

## Consequências

- A automação recebe sempre 8 dígitos, sem necessidade de transformação no lado dela
- O CRM exibe o telefone como `(DDD) XXXX-XXXX` (8 dígitos, sem o 9)
- Clientes com mesmo telefone são permitidos mas visíveis via filtro de duplicatas na tabela

---
title: Spec — Categorização inteligente e detecção de recorrências
area: specs
status: IMPLEMENTADO
updated: 2026-09-19
---

## Resumo

Transforma o de-para estático de `app/src/pages/Transactions/depara.ts` em um
**motor de classificação server-side que aprende**, e aproveita o mesmo
normalizador de descrições para **detectar cobranças recorrentes** (assinaturas,
mensalidades, financiamentos), aumentos de preço e cobranças que sumiram.

Dor resolvida: hoje, importar um extrato exige escolher a categoria linha a
linha, e toda regra nova é um commit no código. Além disso, nada no app mostra
"você paga R$ 437/mês em assinaturas".

- **Pré-requisito:** [`00-llm-provider.md`](./00-llm-provider.md)
- **Esforço:** médio (2 a 3 dias)
- **Custo de IA:** zero com Ollama; ~R$ 0,02 por extrato importado com Haiku

---

## Estado atual (o que já existe)

| Peça | Onde | O que faz |
|---|---|---|
| `DEPARA_RULES` | `app/src/pages/Transactions/depara.ts` | 9 regras hardcoded, match por substring sem acento |
| `matchDepara()` / `resolveName()` | idem | Aplica a primeira regra que casa |
| `ImportModal` | `app/src/pages/Transactions/ImportModal.tsx` | Wizard 3 etapas; a etapa "Revisar" já é editável linha a linha |
| `POST /transactions/bulk` | `api/src/routes/transactions.ts:207` | Insere em transação única e ajusta saldo |

Limitações que esta spec ataca: regras no frontend (não servem ao Open Finance
nem a nenhum outro consumidor), sem aprendizado, sem cobertura para descrições
novas, e `recurrence`/`isEssential` sempre preenchidos na mão.

---

## Arquitetura

```
CSV / Open Finance / transação manual
            │
            ▼
  normalizeDescription()      ← determinístico, sem IA
            │
            ▼
   ┌──────────────────┐   casou? → aplica e encerra (confidence 1.0)
   │  Camada 1: regras │
   └──────────────────┘
            │ não casou
            ▼
   ┌──────────────────┐   ≥ 0.75 de similaridade → aplica (confidence = sim.)
   │  Camada 2: kNN    │   por histórico já classificado
   └──────────────────┘
            │ abaixo do limiar
            ▼
   ┌──────────────────┐   LLM escolhe de uma lista fechada de categorias
   │  Camada 3: LLM    │   (lote de até 40 linhas por chamada)
   └──────────────────┘
            │
            ▼
      sugestão + confidence + source  →  tela de revisão
            │
            ▼
   usuário corrige  →  POST /classification/feedback  →  vira regra nova
```

As três camadas são **cascata com early-exit**: numa importação típica do
Nubank, 70–85% das linhas param na camada 1 ou 2, então o LLM vê poucas linhas.

---

## Banco de dados

### `classification_rules`

Substitui o array do frontend. Migração via `bun run db:generate` +
`db:migrate` (não usar `db:push` porque haverá seed).

```ts
export const ruleSourceEnum = pgEnum("rule_source", [
  "seed",     // migrado do depara.ts original
  "manual",   // criado pelo usuário na tela de regras
  "learned",  // gerado a partir de uma correção na revisão
])

export const ruleMatchEnum = pgEnum("rule_match", [
  "contains", // substring normalizada — o comportamento atual
  "exact",    // descrição normalizada idêntica
  "regex",    // regex JS, validada na criação
])

export const classificationRules = pgTable("classification_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  pattern: varchar("pattern", { length: 255 }).notNull(),
  matchType: ruleMatchEnum("match_type").default("contains").notNull(),
  source: ruleSourceEnum("source").default("manual").notNull(),
  // Quanto maior, antes é avaliada. Regras específicas nascem com prioridade
  // alta; as genéricas, baixa. Empate resolve por pattern mais longo primeiro.
  priority: integer("priority").default(100).notNull(),
  // Todos os campos abaixo são opcionais: a regra aplica só o que preencher
  renameTo: varchar("rename_to", { length: 255 }),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  paymentMethod: paymentMethodEnum("payment_method"),
  recurrence: recurrenceEnum("recurrence"),
  isEssential: boolean("is_essential"),
  // Força o sinal, ignorando o do extrato (caso "Aplicação RDB")
  forceIncome: boolean("force_income"),
  budgetId: uuid("budget_id").references(() => budgets.id, {
    onDelete: "set null",
  }),
  enabled: boolean("enabled").default(true).notNull(),
  // Telemetria: quantas vezes a regra já casou e quando foi a última
  hitCount: integer("hit_count").default(0).notNull(),
  lastHitAt: timestamp("last_hit_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
})
```

Índices: `(enabled, priority desc)` e um `unique(pattern, matchType)` para
impedir regra duplicada.

### `recurring_series`

```ts
export const recurringStatusEnum = pgEnum("recurring_status", [
  "ACTIVE",    // cobrada dentro da janela esperada
  "OVERDUE",   // passou da janela esperada sem cobrança
  "CANCELLED", // sem cobrança há mais de 2 ciclos — provavelmente encerrada
])

export const recurringSeries = pgTable("recurring_series", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Chave normalizada do estabelecimento — agrupa as ocorrências
  merchantKey: varchar("merchant_key", { length: 255 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  categoryId: uuid("category_id").references(() => categories.id),
  walletId: uuid("wallet_id").references(() => wallets.id),
  // Intervalo típico em dias (30 = mensal, 365 = anual, 7 = semanal)
  intervalDays: integer("interval_days").notNull(),
  occurrences: integer("occurrences").notNull(),
  averageAmount: numeric("average_amount", { precision: 10, scale: 2 }).notNull(),
  lastAmount: numeric("last_amount", { precision: 10, scale: 2 }).notNull(),
  firstAmount: numeric("first_amount", { precision: 10, scale: 2 }).notNull(),
  lastChargeDate: date("last_charge_date").notNull(),
  expectedNextDate: date("expected_next_date").notNull(),
  status: recurringStatusEnum("status").default("ACTIVE").notNull(),
  // Usuário marcou como "não é assinatura" — nunca mais sugerir
  dismissed: boolean("dismissed").default(false).notNull(),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
})
```

Unique em `(merchantKey, walletId)`. A tabela é um **cache derivado**: pode ser
apagada e recalculada de `transactions` a qualquer momento, com a única exceção
de `dismissed`, que precisa sobreviver (o recálculo faz `UPSERT` preservando o
campo).

### Seed

`api/src/db/seed-rules.ts` insere as 9 regras atuais de `depara.ts` como
`source: "seed"`, resolvendo `categoryName` → `categoryId` por nome exato. Se a
categoria não existir, a regra entra com `categoryId: null` (mesmo
comportamento tolerante de hoje). Prioridades seguem a ordem atual do array:
a primeira regra vira `priority: 900`, decrescendo de 100 em 100 — preserva o
comentário "ordem importa" do arquivo original.

---

## Módulo backend

```
api/src/modules/classification/
├── index.ts            # export { classificationRoute, ... }
├── routes.ts           # endpoints
├── service.ts          # orquestra as 3 camadas
├── normalize.ts        # normalizeDescription() + merchantKey()
├── rules.ts            # camada 1
├── knn.ts              # camada 2
├── llm.ts              # camada 3 (prompt + schema zod)
├── recurring.ts        # detector de séries
├── normalize.test.ts
├── rules.test.ts
├── knn.test.ts
└── recurring.test.ts
```

Registrar em `api/src/index.ts` com `.use(classificationRoute)`.

### `normalize.ts`

`normalizeDescription(raw)` — pipeline determinístico:

1. `NFD` + remoção de diacríticos + `toLowerCase()` (igual ao `normalize()` de
   hoje em `depara.ts`).
2. Remove ruído de extrato: datas (`\d{2}/\d{2}`), parcelas (`\d+/\d+`),
   `NU PAGAMENTOS`, `- IP`, CNPJ/CPF mascarados (`[•*\d./-]{8,}`).
3. Colapsa espaços.

`merchantKey(raw)` — aplica o acima e ainda remove números soltos e sufixos de
loja (`\bLTDA\b`, `\bME\b`, `\bSA\b`, `\b\d{3,}\b`), devolvendo até 6 palavras.
É a chave usada pelo kNN e pelo detector de recorrências. Precisa ser estável:
"UBER *TRIP 8821" e "UBER* TRIP SP" devem gerar a mesma chave.

### `rules.ts` — camada 1

Carrega as regras habilitadas ordenadas por `priority desc, length(pattern)
desc`, com cache em memória invalidado a cada escrita no CRUD. Aplica a
primeira que casar. Regra `regex` é compilada com try/catch: regex inválida é
desabilitada e logada, nunca derruba a importação.

Resultado: `{ source: "rule", ruleId, confidence: 1, patch: {...} }`.

### `knn.ts` — camada 2

Sem dependência nova e sem embedding de modelo: **similaridade de trigramas**
sobre `merchantKey`.

- Índice em memória construído de `SELECT name, category_id, payment_method,
  recurrence, is_essential FROM transactions` das últimas 1 000 transações
  (escopo: carteira ativa, caindo para global se a carteira tiver menos de 50).
- Similaridade = coeficiente de Dice entre os conjuntos de trigramas.
- Pega os 5 vizinhos mais próximos, vota ponderado pela similaridade, e devolve
  a categoria vencedora com `confidence = similaridade média dos vizinhos que
  votaram na vencedora`.
- Aplica só se `confidence >= 0.75` (constante `KNN_THRESHOLD`, exportada para
  o teste).

Postgres tem `pg_trgm`, mas o índice em memória evita uma extensão nova e é
irrelevante em performance nesse volume. Se a base passar de ~50 mil
transações, trocar por `pg_trgm` é uma mudança interna de `knn.ts`.

### `llm.ts` — camada 3

Uma chamada por lote de até 40 descrições. Prompt:

- **system:** define o papel (classificador de extrato bancário brasileiro),
  proíbe inventar categoria fora da lista, exige `null` quando incerto, e manda
  responder só JSON.
- **user:** a lista numerada de categorias existentes (`id` + `name`) e a lista
  numerada de descrições já normalizadas.

Schema zod da resposta:

```ts
const schema = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      categoryId: z.string().uuid().nullable(),
      isEssential: z.boolean().nullable(),
      recurrence: z.enum(["fixed", "variable"]).nullable(),
      confidence: z.number().min(0).max(1),
      // Nome curto e legível para substituir a descrição crua do extrato
      suggestedName: z.string().max(60).nullable(),
    })
  ),
})
```

Pós-validação obrigatória no código (o zod não basta):

- `categoryId` que não está na lista enviada → vira `null`.
- `index` fora do intervalo ou repetido → descartado.
- Linha ausente na resposta → fica sem sugestão, não trava nada.
- `confidence` reportada pelo modelo é multiplicada por `0.9` (teto de 0,9):
  sugestão de IA **nunca** chega com a confiança de uma regra determinística.

Nunca enviar ao LLM: valor, saldo, número de conta, nome do titular. Só a
descrição normalizada. Isso limita o que sai da máquina quando o provedor é a
nuvem e está documentado aqui porque é uma decisão, não um detalhe.

### `recurring.ts` — detector

Roda sobre `transactions` (despesas, `amount > 0`), escopado por carteira:

1. Agrupa por `merchantKey`.
2. Descarta grupos com menos de 3 ocorrências (`MIN_OCCURRENCES`).
3. Calcula os intervalos entre datas consecutivas; pega a **mediana**.
4. Classifica o ciclo: mediana em 26–35 dias → mensal (`intervalDays: 30`);
   6–8 → semanal; 84–100 → trimestral; 350–380 → anual. Fora disso, descarta.
5. Exige regularidade: desvio-padrão dos intervalos ≤ 20% da mediana.
6. Exige estabilidade de valor: coeficiente de variação dos valores ≤ 0,25
   (`AMOUNT_CV_MAX`) — deixa passar reajuste, barra supermercado.
7. `expectedNextDate = lastChargeDate + intervalDays`.
8. `status`: `ACTIVE` se hoje ≤ `expectedNextDate + 5 dias`; `OVERDUE` até
   2 ciclos; `CANCELLED` depois disso.

Sinais derivados, calculados na hora da consulta (não persistidos):

- **Aumento de preço**: `lastAmount > firstAmount * 1.05` → devolve
  `priceChangePct` e `priceChangeSince` (data da primeira cobrança no valor novo).
- **Custo mensal normalizado**: `averageAmount * 30 / intervalDays` — permite
  somar assinatura anual com mensal no mesmo total.
- **Cobrança fantasma**: série `ACTIVE` cuja categoria o usuário nunca abriu —
  fora de escopo nesta spec, fica para o check-up mensal (spec 02).

O recálculo roda: ao final de todo `POST /transactions/bulk`, ao criar/editar/
excluir transação (debounce de 5s para não recalcular em rajada de importação),
e sob demanda via `POST /recurring/recalculate`.

---

## API

Prefixo `/classification` para o motor e `/recurring` para as séries. Todos os
handlers usam `status()`, nunca `error()` (ver
`.claude/docs/decisions/elysia-status-helper.md`).

### `POST /classification/suggest`

Recebe descrições cruas, devolve sugestões. É o coração da spec.

```jsonc
// request
{
  "walletId": "uuid | null",
  "useAi": true,            // false pula a camada 3
  "items": [
    { "index": 0, "description": "PAG*Netflix", "date": "2026-09-03", "amount": 55.9 }
  ]
}
```

```jsonc
// response 200
{
  "aiAvailable": true,
  "items": [
    {
      "index": 0,
      "source": "rule | knn | llm | none",
      "ruleId": "uuid | null",
      "confidence": 0.86,
      "suggestedName": "Netflix",
      "categoryId": "uuid | null",
      "paymentMethod": "credit_card | null",
      "recurrence": "fixed | null",
      "isEssential": false,
      "budgetId": null,
      "forceIncome": null
    }
  ],
  "stats": { "rule": 12, "knn": 5, "llm": 3, "none": 1, "llmLatencyMs": 1840 }
}
```

`amount` e `date` vão no request porque o detector de recorrência usa, mas
**não** são repassados ao LLM.

### `POST /classification/feedback`

Chamado quando o usuário corrige uma sugestão na revisão. É o que faz o sistema
aprender.

```jsonc
{
  "description": "PAG*Netflix 12/24",
  "categoryId": "uuid",
  "paymentMethod": "credit_card",
  "recurrence": "fixed",
  "isEssential": false,
  "renameTo": "Netflix",
  "createRule": true   // false só registra, não cria regra
}
```

Comportamento:

1. Deriva o `pattern` com `merchantKey(description)`.
2. Se já existe regra `learned` com esse pattern, **atualiza** os campos.
3. Se existe regra `seed`/`manual` com esse pattern, não sobrescreve —
   devolve `409` com `{ conflictRuleId }` e a UI oferece "editar a regra
   existente".
4. Caso contrário, cria com `source: "learned"`, `priority: 500`.

Resposta: `{ ruleId, created: boolean }`.

### CRUD de regras

| Método | Rota | Descrição |
|---|---|---|
| GET | `/classification/rules` | Lista com `search`, `source`, `enabled`; ordenada por `priority desc` |
| POST | `/classification/rules` | Cria (valida regex quando `matchType: "regex"`) |
| PUT | `/classification/rules/:id` | Edita |
| PATCH | `/classification/rules/:id/toggle` | Liga/desliga sem apagar |
| DELETE | `/classification/rules/:id` | Remove de vez |
| POST | `/classification/rules/test` | `{ pattern, matchType }` → devolve até 20 transações existentes que casariam. Preview antes de salvar |

### Séries recorrentes

| Método | Rota | Descrição |
|---|---|---|
| GET | `/recurring` | Lista com `status`, `walletId`; inclui `monthlyCostBrl`, `priceChangePct`, `totalMonthly` no rodapé |
| POST | `/recurring/recalculate` | Força o recálculo; devolve `{ detected, updated, removed }` |
| PATCH | `/recurring/:id/dismiss` | Marca `dismissed: true` |
| GET | `/recurring/:id/transactions` | As transações que compõem a série |

---

## Frontend

### `ImportModal` — mudanças

O arquivo `depara.ts` é **removido** e o `matchDepara()` local sai; a etapa
"Arquivo" passa a chamar `POST /classification/suggest` logo após o parse do
CSV. Enquanto a chamada está em voo, mostrar skeleton na tabela de revisão (a
chamada com IA pode levar 2–5s num modelo local).

Na tabela de revisão, cada linha ganha um **selo de origem** ao lado da
categoria:

| Origem | Selo | Cor |
|---|---|---|
| `rule` | "regra" | `muted` |
| `knn` | "histórico" | `muted` |
| `llm` | "IA 86%" | âmbar quando `confidence < 0.7` |
| `none` | campo vazio destacado | `destructive` sutil |

Ordenar as linhas com `none` e baixa confiança **no topo** por padrão (um toggle
"ordenar por confiança" no cabeçalho) — o usuário revisa primeiro o que importa.

Quando o usuário troca a categoria de uma linha, disparar
`POST /classification/feedback` em background (sem bloquear) e mostrar um toast
discreto: "Regra criada para Netflix" com ação "desfazer".

### Nova página `/rules`

Rota lazy em `App.tsx`, item na sidebar. Tabela de regras com:

- busca, filtro por origem, coluna `hitCount` ("usada 14x").
- modal de criar/editar com **preview ao vivo** (`POST /rules/test` com
  debounce de 400ms) mostrando o que casaria.
- toggle de habilitar direto na linha.
- badge "aprendida" para `source: "learned"`, com ação "promover a manual".

### Nova página `/recurring` (ou aba dentro de `/rules`)

Cards agrupados por status, com o total mensal normalizado em destaque no topo
("R$ 437,90/mês em 11 cobranças recorrentes"). Cada card: label, categoria,
valor, ciclo, próxima cobrança prevista, e badge vermelho
"+18% desde março" quando houver aumento. Ações: "não é recorrente" (dismiss) e
"ver transações".

### Camada de dados

`app/src/lib/api.ts` ganha `api.classification.*` e `api.recurring.*`;
`app/src/lib/queries.ts` ganha as chaves:

```ts
classification: {
  all: ["classification"] as const,
  rules: (params: ListRulesParams) => [...keys.classification.all, "rules", params] as const,
},
recurring: {
  all: ["recurring"] as const,
  list: (params: ListRecurringParams) => [...keys.recurring.all, "list", params] as const,
},
```

`useClassificationSuggest()` é `useMutation` (não query — é POST com corpo
grande e não deve cachear). Feedback invalida `keys.classification.rules`.

---

## Testes

Unitários (`bun test` no `api/`), todos sem rede — LLM via `__setLlm(mock)`:

- `normalize.test.ts` — tabela de casos reais do extrato NU: "Transferência
  enviada pelo Pix - FULANO - •••.811.569-•• - NU PAGAMENTOS" → chave estável;
  "UBER *TRIP 8821" e "UBER* TRIP SP" → mesma `merchantKey`.
- `rules.test.ts` — ordem por prioridade; pattern mais longo ganha no empate;
  regex inválida desabilita a regra sem lançar; regra desabilitada é ignorada.
- `knn.test.ts` — vizinho idêntico dá `confidence: 1`; base vazia devolve
  `none`; abaixo de `KNN_THRESHOLD` devolve `none`.
- `llm.test.ts` — `categoryId` fora da lista vira `null`; índice duplicado é
  descartado; linha faltando na resposta não quebra; teto de confiança 0,9.
- `recurring.test.ts` — 3 cobranças mensais regulares viram série; 2 não viram;
  variação de valor de 40% não vira; aumento de 5,01% acusa `priceChangePct`;
  `dismissed` sobrevive ao recálculo.

Manual, com a carteira **`Claude`** (obrigatório — ver `CLAUDE.md`):
importar `NU_675343637_01NOV2025_30NOV2025.csv` e conferir que as 9 regras
migradas produzem exatamente o mesmo resultado de hoje.

---

## Fases de implementação

Cada fase é commitável e deixa o app funcionando.

1. **Regras no banco** — tabela, seed a partir do `depara.ts`, camada 1,
   `POST /suggest` só com regras, `ImportModal` consumindo a API. Ao fim desta
   fase o comportamento visível é idêntico ao de hoje, mas server-side. *(~4h)*
2. **CRUD + página `/rules`** — com preview. *(~4h)*
3. **Feedback e aprendizado** — `POST /feedback` e o toast na revisão. *(~2h)*
4. **kNN** — camada 2 e o selo "histórico". *(~3h)*
5. **LLM** — camada 3, depende de `00-llm-provider.md`. *(~4h)*
6. **Recorrências** — detector, endpoints e página. *(~6h)*

As fases 1–4 e 6 **não dependem de IA nenhuma**. Se quiser valor rápido sem
montar o Ollama, pare na 4 e faça a 6.

---

## Critérios de aceite

- [ ] `app/src/pages/Transactions/depara.ts` não existe mais e nada no frontend
      classifica sozinho.
- [ ] Importar o CSV de novembro/2025 com IA desligada produz as mesmas
      categorias/renomeações de hoje.
- [ ] Corrigir uma categoria na revisão cria uma regra, e reimportar o mesmo
      extrato acerta aquela linha sozinho.
- [ ] Com `LLM_ENABLED=false`, a importação funciona e a resposta traz
      `aiAvailable: false`.
- [ ] Nenhum valor monetário é enviado ao provedor de LLM (verificável no log
      com `LLM_DEBUG=true`).
- [ ] `/recurring` detecta corretamente "Conceito Imobiliária" (aluguel) e
      "Aymoré Crédito" (financiamento) a partir dos extratos reais.
- [ ] `bun run typecheck` e `bun run lint` limpos nos dois workspaces.
- [ ] Docs atualizadas: `.claude/docs/domain/classification.md`,
      `.claude/docs/api/classification.md`, `.claude/docs/frontend/rules.md`, e
      a seção de importação em `.claude/docs/frontend/transactions-import.md`.

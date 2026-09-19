---
title: Spec — Check-up mensal automático (relatório e anomalias)
area: specs
status: IMPLEMENTADO
updated: 2026-09-19
---

## Resumo

No fechamento de cada mês o app gera um **relatório de consultoria**: aderência
à regra 50/30/20, anomalias por categoria (com significância estatística), o que
mais subiu e caiu, assinaturas novas, e um texto curto em pt-BR explicando tudo
e sugerindo 2 ou 3 ações concretas.

Dor resolvida: o dashboard de hoje mostra *o que* aconteceu, mas ninguém compara
com o mês anterior, com o orçamento planejado nem com o comportamento típico.
O usuário precisaria olhar gráfico por gráfico e concluir sozinho.

- **Pré-requisito:** [`00-llm-provider.md`](./00-llm-provider.md)
  (a IA aqui é **só** a narrativa — o relatório inteiro funciona sem ela)
- **Recomendado, não obrigatório:** [`01-smart-categorization.md`](./01-smart-categorization.md)
  — se as séries recorrentes existirem, a seção de assinaturas é preenchida;
  se não existirem, ela simplesmente não aparece
- **Esforço:** médio (2 a 3 dias)
- **Custo de IA:** 1 chamada por mês por carteira — literalmente centavos por ano

---

## Princípio de projeto

> **Todo número do relatório é calculado em SQL/TypeScript e persistido antes de
> o LLM ser chamado.** O LLM recebe o JSON pronto e escreve prosa. Se a
> narrativa citar um número que não está no JSON, é bug.

Isso é o que permite usar um modelo 7B local sem risco, e o que garante que o
relatório continua correto e útil com a IA desligada.

---

## Métricas do relatório

Tudo escopado por **mês + carteira** (`walletId` opcional, `null` = todas).
Convenção de sinal do projeto: `amount > 0` é despesa, `amount < 0` é entrada
(ver `.claude/docs/domain/transaction.md`).

### 1. Blocos de totais

| Métrica | Cálculo |
|---|---|
| `totalExpenses` | `sum(amount) where amount > 0` |
| `totalIncome` | `abs(sum(amount)) where amount < 0` |
| `netResult` | `totalIncome - totalExpenses` |
| `savingsRate` | `netResult / totalIncome` (null se receita = 0) |
| `transactionCount` | contagem de despesas |
| `avgTicket` | `totalExpenses / transactionCount` |
| `biggestExpense` | a maior despesa isolada, com nome e data |
| `noSpendDays` | dias do mês sem nenhuma despesa |

Cada um acompanha o valor do **mês anterior** e a variação percentual, no mesmo
objeto (`{ current, previous, deltaPct }`). Isso vale para todas as métricas
escalares do relatório — é o que dá material para a narrativa comparar.

### 2. Aderência 50/30/20

O modelo de orçamento do projeto é um **catálogo de gastos planejados
nomeados**, classificados em `essential` / `desire` / `investment`
(ver `.claude/docs/domain/budget.md`), e só gastos `recurrence: "fixed"` têm
`budgetId`. Portanto, duas leituras diferentes e ambas úteis:

**a) Planejado vs. realizado (só o que tem orçamento)**

Para cada `budget`, soma as transações do mês com aquele `budgetId`:

```
status =
  amountType = "fixed"    → "over" se realizado > amount * 1.02
                            "under" se realizado < amount * 0.98
                            "on_track" caso contrário
  amountType = "variable" → "over" se realizado > amountMax
                            "under" se realizado < amountMin
                            "on_track" entre os dois
```

Inclui os orçamentos **sem nenhum lançamento no mês** com status `"missing"` —
é assim que o relatório pega "esqueceu de lançar a conta de luz".

**b) Distribuição 50/30/20 do gasto total**

Como gasto variável não tem `budgetId`, ele precisa ser classificado por outro
critério. Regra (determinística, documentar na UI):

- `recurrence = "fixed"` → herda o `type` do orçamento vinculado.
- `recurrence = "variable"` e `isEssential = true` → `essential`.
- `recurrence = "variable"` e `isEssential = false` → `desire`.
- `investment` só vem de orçamento vinculado.

Resultado: `{ essential: { amountBrl, pct, targetPct: 50, deltaPct } , desire: {...},
investment: {...} }`. Compara contra 50/30/20 e devolve o desvio em pontos
percentuais.

### 3. Anomalias por categoria

Para cada categoria com histórico suficiente:

1. Série dos últimos **6 meses anteriores** ao mês do relatório (não inclui o
   mês corrente).
2. Exige `>= 3` meses com gasto (`MIN_HISTORY_MONTHS`).
3. Usa **mediana e MAD** (desvio absoluto mediano), não média e desvio-padrão —
   com 6 pontos, um mês atípico contamina a média e o alerta nunca dispara.
   `robustZ = 0.6745 * (atual - mediana) / MAD`.
4. Se `MAD = 0` (valor idêntico todo mês, ex.: aluguel), usa variação
   percentual simples com limiar de 10%.
5. Classifica:

| `robustZ` | Severidade |
|---|---|
| `>= 3.5` | `high` |
| `>= 2.0` | `medium` |
| `<= -2.0` | `saving` (gastou bem menos — também é notícia) |
| resto | não entra no relatório |

Cada anomalia carrega: categoria, valor atual, mediana histórica, `robustZ`,
severidade, e **as 3 maiores transações** que a compõem — sem isso o usuário lê
"Alimentação subiu 48%" e não sabe por quê.

### 4. Top movers

As 5 categorias que mais subiram e as 5 que mais caíram em **valor absoluto**
(não percentual — 300% de uma categoria de R$ 20 não é notícia) versus o mês
anterior.

### 5. Estabelecimentos novos

`merchantKey` (de [`01`](./01-smart-categorization.md), ou o fallback de
normalização simples se a spec 01 não estiver implementada) que aparece no mês
e não aparece nos 6 meses anteriores, com gasto total `>= R$ 50`. Mostra os 5
maiores.

### 6. Assinaturas *(só se a spec 01 estiver implementada)*

Da tabela `recurring_series`: total mensal normalizado, séries novas no mês,
séries com aumento de preço, e séries `OVERDUE`/`CANCELLED`.

### 7. Insights estruturados

Antes do LLM, o motor produz uma lista de **insights tipados** — é isso que a UI
renderiza como cards e o que a narrativa recebe:

```ts
type InsightKind =
  | "budget_over"        // estourou um orçamento
  | "budget_missing"     // orçamento sem lançamento no mês
  | "category_spike"     // anomalia high/medium
  | "category_saving"    // anomalia negativa
  | "rule_5030 20_off"   // desvio > 5pp da meta 50/30/20
  | "subscription_new"
  | "subscription_price_up"
  | "negative_month"     // netResult < 0
  | "record_month"       // maior/menor gasto dos últimos 6 meses

interface Insight {
  kind: InsightKind
  severity: "info" | "warn" | "critical"
  title: string          // já pronto em pt-BR, sem IA
  amountBrl: number | null
  // Referências para a UI navegar até a origem
  categoryId?: string
  budgetId?: string
  recurringSeriesId?: string
  /** Dados crus que a narrativa pode citar — nada além disto vai ao LLM */
  facts: Record<string, number | string>
}
```

Os insights são ordenados por severidade e depois por `amountBrl` desc, e o
relatório guarda no máximo 12.

---

## Banco de dados

```ts
export const reportStatusEnum = pgEnum("report_status", [
  "GENERATED",      // números prontos, sem narrativa
  "NARRATED",       // com texto da IA
  "NARRATION_FAILED", // números prontos, IA falhou (UI mostra aviso)
])

export const monthlyReports = pgTable("monthly_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  month: integer("month").notNull(), // 1–12
  year: integer("year").notNull(),
  walletId: uuid("wallet_id").references(() => wallets.id, {
    onDelete: "cascade",
  }),
  status: reportStatusEnum("status").default("GENERATED").notNull(),
  /** Todas as métricas das seções 1–6, no formato MonthlyReportMetrics */
  metrics: jsonb("metrics").notNull(),
  /** Insight[] da seção 7 */
  insights: jsonb("insights").notNull(),
  /** Markdown curto gerado pelo LLM — null quando não houve narrativa */
  narrative: text("narrative"),
  /** Sugestões acionáveis extraídas da mesma chamada do LLM */
  suggestions: jsonb("suggestions"),
  narrativeProvider: varchar("narrative_provider", { length: 30 }),
  narrativeModel: varchar("narrative_model", { length: 80 }),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
})
```

Unique em `(month, year, walletId)`. Regenerar **sobrescreve** a linha
(o relatório é derivado; não há histórico de versões).

`metrics` e `insights` em `jsonb` e não em colunas: o relatório é um snapshot
imutável do mês, não se consulta por dentro dele. Se um dia precisar filtrar
por conteúdo, `jsonb_path_ops` resolve sem migração de esquema.

---

## Módulo backend

```
api/src/modules/reports/
├── index.ts
├── routes.ts
├── service.ts        # orquestra: metrics → insights → narrative → persist
├── metrics.ts        # seções 1–6, SQL puro
├── insights.ts       # seção 7, regras determinísticas
├── narrative.ts      # prompt + chamada ao LlmProvider
├── stats.ts          # median, mad, robustZ
├── types.ts
├── metrics.test.ts
├── insights.test.ts
└── stats.test.ts
```

`stats.ts` é deliberadamente separado e 100% puro — é o arquivo mais fácil de
testar e o que mais barato é de acertar.

### `narrative.ts`

- **system:** "Você é um consultor financeiro pessoal falando em português do
  Brasil. Você recebe um JSON com os números já apurados. Nunca calcule nem
  invente números: use exclusivamente os valores presentes no JSON. Tom direto e
  respeitoso, sem moralismo e sem jargão. Máximo 200 palavras."
- **user:** o JSON de `metrics` (podado — só os campos que interessam) e a lista
  de `insights`.
- Saída estruturada validada por zod:

```ts
const schema = z.object({
  narrative: z.string().min(40).max(1600),
  suggestions: z
    .array(
      z.object({
        title: z.string().max(80),
        rationale: z.string().max(240),
        // Quanto essa ação economizaria por mês, se estimável a partir do JSON
        estimatedSavingBrl: z.number().nullable(),
        insightKind: z.string().nullable(),
      })
    )
    .min(1)
    .max(3),
})
```

**Validação anti-alucinação (obrigatória):** depois do zod, varrer a narrativa
com regex de valores (`R\$\s?[\d.,]+` e `\d+(?:,\d+)?%`) e conferir cada um
contra o conjunto de números presentes em `metrics`/`insights`, com tolerância
de arredondamento de ±1%. Se algum número não for encontrado, a narrativa é
**descartada** e o relatório fica `NARRATION_FAILED`. Melhor sem texto do que
com texto errado. Logar o caso para ajuste de prompt.

`temperature: 0.4` — precisa de prosa natural, mas não criativa.

---

## API

Prefixo `/reports`.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/reports/monthly/generate` | `{ month, year, walletId?, narrate?: boolean }` → gera (ou regenera) e devolve o relatório. `narrate` default `true` |
| GET | `/reports/monthly` | Lista resumida (`month`, `year`, `status`, `totalExpenses`, contagem de insights `critical`), ordenada desc |
| GET | `/reports/monthly/:id` | Relatório completo |
| GET | `/reports/monthly/current` | Atalho: `?walletId=` → o relatório do mês anterior ao atual, gerando na hora se não existir |
| POST | `/reports/monthly/:id/narrate` | Só (re)gera a narrativa de um relatório já existente. Usado pelo botão "tentar de novo" quando a IA estava fora |
| DELETE | `/reports/monthly/:id` | Apaga |

`POST /generate` de um mês **ainda em curso** é permitido, mas a resposta traz
`partial: true` e a UI rotula "mês em andamento" — o comparativo com o mês
anterior fica enviesado e isso precisa estar visível.

Geração é síncrona: as queries são de um mês de dados e a narrativa é uma
chamada. Se num modelo local a narrativa passar de ~30s, mover só ela para
background com `status: GENERATED` → `NARRATED` via polling da UI (o schema já
comporta, não precisa migração).

---

## Automação mensal

Script `api/scripts/monthly-report.ts`:

```
bun run api/scripts/monthly-report.ts            # mês anterior, todas as carteiras
bun run api/scripts/monthly-report.ts 2026-08    # mês específico
```

Chama o mesmo `service.generate()` da rota (nunca duplicar lógica no script) e
é idempotente — rodar duas vezes sobrescreve.

Agendamento, em ordem de preferência para uso local:

1. **Agendador de Tarefas do Windows** — dia 1, 09:00, `America/Sao_Paulo`.
   É o mais adequado ao ambiente do usuário (Windows 11) e não exige processo
   rodando 24/7. Documentar o comando exato em `.claude/docs/infra/scheduler.md`.
2. **Fallback in-app** — o `GET /reports/monthly/current` já gera sob demanda,
   então mesmo sem agendador nenhum o usuário vê o relatório ao abrir a página.
   Este fallback é **obrigatório**; o agendador é conveniência.

Notificação (opcional, fase posterior): webhook do Telegram com o resumo e o
link `http://localhost:5173/reports/:id`. Variável `REPORT_WEBHOOK_URL`.

---

## Frontend

### Nova página `/reports`

Rota lazy em `App.tsx` + item na sidebar (ícone `FileText`).

**Cabeçalho** — seletor de mês (mesmo componente de navegação por mês já usado
em Transações, ver `.claude/docs/frontend/transactions-filters.md`), respeitando
a carteira ativa do `WalletProvider`, e botão "Regerar".

**Layout do relatório, na ordem em que se lê:**

1. **Veredito** — uma linha grande: "Você fechou setembro com R$ 1.240
   positivos" ou "…com R$ 320 negativos", em `FINANCE.income`/`FINANCE.expense`.
   Abaixo, 4 tiles: gasto total, receita, resultado, taxa de poupança — cada um
   com a seta de variação vs. mês anterior.
2. **Narrativa** — card com o texto da IA, tipografia de leitura (max-width
   ~65ch), e rodapé discreto "Texto gerado por IA a partir dos números acima ·
   qwen2.5:7b". Quando `NARRATION_FAILED` ou `GENERATED`, mostra um card vazio
   com "Narrativa indisponível" e o botão "Gerar texto".
3. **Insights** — grade de cards, cor da borda por severidade, cada um clicável
   navegando para `/transactions` com o filtro já aplicado (categoria + período).
4. **50/30/20** — barra empilhada realizado vs. barra de meta, lado a lado, com
   o desvio em pp.
5. **Orçamentos** — tabela planejado vs. realizado, com barra de progresso por
   linha e destaque para `over` e `missing`.
6. **Anomalias** — para cada uma, sparkline dos 6 meses + o mês atual em
   destaque, e as 3 transações que puxaram.
7. **Assinaturas** — só quando a spec 01 existir.

Ao construir os gráficos, carregar a skill `dataviz` antes e usar `recharts` com
a paleta de `lib/tokens.ts` (`CHART_PALETTE`) — nunca cor literal.

### Card no Home

Um card "Check-up de <mês anterior>" com o veredito em uma linha, os 2 insights
mais severos e link para `/reports`. Só aparece quando existe relatório do mês
anterior (ou quando dá para gerar).

### Camada de dados

`api.reports.*` em `lib/api.ts`; em `queries.ts`:

```ts
reports: {
  all: ["reports"] as const,
  list: (walletId?: string) => [...keys.reports.all, "list", walletId ?? ""] as const,
  detail: (id: string) => [...keys.reports.all, "detail", id] as const,
  current: (walletId?: string) => [...keys.reports.all, "current", walletId ?? ""] as const,
},
```

`useGenerateReport()` invalida `keys.reports.all`. A geração pode demorar —
usar `toast.promise` do `sonner`, já disponível.

---

## Testes

- `stats.test.ts` — `median`, `mad`, `robustZ` contra valores conferidos na mão;
  `MAD = 0` cai na variação percentual; série com menos de 3 pontos devolve
  `null` em vez de lançar.
- `metrics.test.ts` — com um seed fixo de transações: sinais de entrada e
  despesa somados corretamente; `savingsRate` nulo quando não há receita;
  `noSpendDays` correto num mês de 30 e num de 31 dias; escopo por carteira
  isola de verdade.
- `insights.test.ts` — orçamento `variable` dentro da faixa não gera insight;
  R$ 0,01 acima do `amountMax` gera; orçamento sem lançamento gera
  `budget_missing`; ordenação por severidade e valor.
- `narrative.test.ts` — com `__setLlm(mock)`: narrativa citando um número
  inexistente é descartada e o status vira `NARRATION_FAILED`; narrativa
  coerente é aceita; mock lançando erro não derruba a geração.

Manual: gerar o relatório de nov/2025 na carteira **`Claude`** a partir do CSV
real importado e conferir os totais contra o dashboard do mesmo mês — eles
**têm** que bater.

---

## Fases de implementação

1. **Motor de métricas** — `stats.ts`, `metrics.ts`, tabela, `POST /generate`
   sem narrativa, `GET /:id`. Validável só por JSON. *(~6h)*
2. **Insights** — `insights.ts` e os tipos. *(~3h)*
3. **Página `/reports`** — tudo menos a narrativa. Já é entregável e útil. *(~6h)*
4. **Narrativa** — `narrative.ts` + validação anti-alucinação + card na UI.
   Depende de [`00`](./00-llm-provider.md). *(~4h)*
5. **Automação** — script, agendador do Windows, card no Home. *(~3h)*
6. **Assinaturas** — seção que consome a spec 01, se existir. *(~2h)*

---

## Critérios de aceite

- [ ] Os totais do relatório batem exatamente com `GET /dashboard/summary` do
      mesmo mês e carteira.
- [ ] Com `LLM_ENABLED=false`, `POST /generate` responde 200, o relatório abre
      completo e só a narrativa está ausente, com aviso.
- [ ] Nenhum número exibido na UI vem do campo `narrative`.
- [ ] Uma narrativa com número inventado é rejeitada pela validação (coberto por
      teste).
- [ ] Regerar o mesmo mês sobrescreve, não duplica.
- [ ] O relatório de um mês sem nenhuma transação abre sem erro, com estado
      vazio (ver `.claude/docs/frontend/states.md`).
- [ ] `bun run typecheck` e `bun run lint` limpos.
- [ ] Docs: `.claude/docs/domain/monthly-report.md`,
      `.claude/docs/api/reports.md`, `.claude/docs/frontend/reports.md`,
      `.claude/docs/infra/scheduler.md`.

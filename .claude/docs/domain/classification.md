---
title: Classificação inteligente e recorrências
area: domain
updated: 2026-09-23
---

## Visão geral

Motor server-side que decide categoria, nome, forma de pagamento e recorrência
de uma descrição de extrato. Substituiu o de-para hardcoded que vivia em
`app/src/pages/Transactions/depara.ts` (arquivo removido) — hoje nada no
frontend classifica sozinho.

O mesmo normalizador de descrições alimenta o **detector de cobranças
recorrentes** (assinaturas, mensalidades, financiamentos).

Implementa `.claude/docs/specs/01-smart-categorization.md`.

## As três camadas

Cascata com *early-exit*: a primeira camada que resolve encerra a linha.

| # | Camada | Arquivo | Confiança | Quando aplica |
|---|--------|---------|-----------|---------------|
| 1 | Regras | `rules.ts` | `1` | Primeira regra habilitada que casa |
| 2 | kNN (histórico) | `knn.ts` | similaridade | Similaridade ≥ `KNN_THRESHOLD` (0,75) |
| 3 | LLM | `llm.ts` | ≤ `0,9` | Só o que sobrou, e só com IA disponível |

Numa importação típica do Nubank a maioria das linhas para na camada 1 ou 2,
então o LLM vê poucas linhas. O que nenhuma camada resolve volta com
`source: "none"` e fica em branco para o usuário preencher — exatamente o
comportamento anterior ao motor existir.

## Normalização

`normalize.ts`, determinístico e sem IA:

- **`normalizeDescription(raw)`** — remove acentos, baixa a caixa, remove ruído
  de extrato (`NU PAGAMENTOS`, ` - IP`, CPF/CNPJ mascarados, parcelas e datas
  curtas) e colapsa espaços. É o texto que as regras comparam.
- **`merchantKey(raw)`** — aplica o acima e ainda remove pontuação, números
  soltos, sufixos societários (`LTDA`, `ME`, `SA`…) e códigos de UF, devolvendo
  até 6 palavras. Precisa ser estável: `UBER *TRIP 8821` e `UBER* TRIP SP` geram
  a mesma chave. É a chave do kNN e do detector de recorrências.
- **`pixRecipientName(raw)`** — único renomeador **dinâmico** herdado do
  de-para: o destinatário do Pix vem dentro da própria descrição e não caberia
  num `renameTo` fixo. A regra seed do Pix tem `renameTo: null` e o serviço
  aplica esta função como fallback de nome.

### Os dois espaços de texto (importante)

Regras `seed`/`manual` têm patterns que aparecem na **descrição normalizada**
(`"conceito imobiliaria"`). Regras `learned` nascem de
`merchantKey(description)` — sem pontuação nem números (`"pag barbeariadoze"`).

Por isso `matchRule()` compara `contains`/`exact` contra **os dois textos**.
Sem isso, toda regra aprendida deixaria de casar com a própria descrição que a
criou.

## Tabela `classification_rules`

| Campo | Papel |
|---|---|
| `pattern` + `matchType` | `contains` (padrão), `exact` ou `regex` |
| `source` | `seed` (migrada do de-para) · `manual` · `learned` |
| `priority` | Maior avalia antes; empate resolve por pattern mais longo |
| `renameTo`, `categoryId`, `paymentMethod`, `recurrence`, `isEssential`, `budgetId` | Só aplica o que estiver preenchido |
| `forceIncome` | Força o sinal, ignorando o do extrato (caso "Aplicação RDB") |
| `enabled` | Desliga sem apagar |
| `hitCount`, `lastHitAt` | Telemetria de uso |

Unique em `(pattern, matchType)`. Regex inválida é desabilitada em memória e
logada — nunca derruba a importação.

### Seed

`api/src/db/seed-rules.ts` (`bun run db:seed:rules`) insere as regras do
`depara.ts` original como `source: "seed"`, resolvendo `categoryName` →
`categoryId` por nome exato (categoria inexistente → `categoryId: null`, mesmo
comportamento tolerante de antes). É **idempotente**: só insere o que falta,
nunca sobrescreve o que o usuário editou.

A ordem do array original vira `priority`, começando em 900 e caindo de 10 em
10 — passo de 100 levaria as últimas regras a prioridade negativa e achataria a
ordem justamente entre as genéricas.

## Aprendizado (feedback)

Corrigir uma categoria na revisão da importação chama
`POST /classification/feedback`:

1. Deriva o pattern com `merchantKey(description)`.
2. Já existe regra `learned` com esse pattern → **atualiza**.
3. Já existe regra `seed`/`manual` → **não sobrescreve**, devolve `409` com
   `conflictRuleId`.
4. Caso contrário, cria com `source: "learned"`, `priority: 500`.

Efeito prático: reimportar o mesmo extrato acerta aquela linha sozinho, e
variações da mesma loja também, porque o pattern vive em espaço de
`merchantKey`.

## Privacidade na camada 3

Ao LLM vai **apenas a descrição normalizada**. Nunca valor, saldo, número de
conta ou nome do titular. `amount` e `date` chegam no request porque o detector
de recorrência usa, mas não são repassados ao provedor.

Pós-validação obrigatória da resposta (o zod não basta): `categoryId` fora da
lista enviada vira `null`; índice fora do intervalo ou repetido é descartado;
linha ausente na resposta não trava nada (o modelo local **omite linhas** na
prática); a confiança do modelo é multiplicada pelo teto de `0,9`.

### Tolerância por linha (não por lote)

O schema do lote é frouxo de propósito: `items` é uma lista de valores
desconhecidos, validados **um a um**. Um modelo 7B erra um campo de vez em
quando — escreve `"fixo"` em vez de `"fixed"`, manda a confiança como `80` em
vez de `0.8`, responde `"sim"` no lugar de `true`.

Com um schema estrito, um único campo torto numa linha derrubava o lote inteiro
de até 40 descrições e o usuário perdia **todas** as sugestões por causa de uma.
Hoje:

| Situação | O que acontece |
|---|---|
| `recurrence` em português | Convertida (`fixo`/`mensal` → `fixed`) |
| `recurrence` irreconhecível | Vira `null`, o resto da linha é aproveitado |
| `isEssential` como `"sim"`/`"não"` | Convertido |
| Confiança em percentual (`80`) | Normalizada para `0,8` |
| Confiança ausente ou absurda | Vira `0,5` — incerteza honesta |
| Linha sem `index` utilizável | Só ela é descartada |
| Nome com mais de 60 caracteres | Truncado |

O prompt também carrega um exemplo completo com os valores exatos em inglês,
que é o que mais reduz a deriva do modelo local.

## Detector de recorrências

`recurring.ts`, sobre despesas (`amount > 0`) do Open Finance (`COUNTED_TRANSACTIONS`), num escopo único. `recurring_series` é única por `merchant_key`:

1. Agrupa por `merchantKey`.
2. Descarta grupos com menos de `MIN_OCCURRENCES` (3).
3. Mediana dos intervalos entre datas consecutivas.
4. Classifica o ciclo: 6–8 dias → semanal (7); 26–35 → mensal (30); 84–100 →
   trimestral (90); 350–380 → anual (365). Fora disso, descarta.
5. Regularidade: desvio médio dos intervalos ≤ 20% da mediana.
6. Estabilidade de valor: coeficiente de variação ≤ `AMOUNT_CV_MAX` (0,25) —
   deixa passar reajuste, barra supermercado.
7. `expectedNextDate = lastChargeDate + intervalDays`.
8. `status`: `ACTIVE` até `expectedNextDate + 5 dias`; `OVERDUE` até 2 ciclos;
   `CANCELLED` depois.

Sinais **derivados na consulta**, não persistidos:

- `monthlyCostBrl = averageAmount * 30 / intervalDays` — permite somar
  assinatura anual com mensal no mesmo total.
- `priceChangePct` / `priceChangeSince` quando `lastAmount > firstAmount * 1,05`.

`recurring_series` é um **cache derivado**: pode ser apagada e recalculada de
`transactions` a qualquer momento. A única exceção é `dismissed`, preservado
pelo recálculo (o usuário disse que não é assinatura).

### Quando recalcula

Ao criar, editar ou excluir transação e ao fim de `POST /transactions/bulk`,
com **debounce de 5s** — uma importação inteira dispara um recálculo só. Também
sob demanda via `POST /recurring/recalculate`.

## Estatística compartilhada

`median`, `mad`, `robustZ`, `stdDev`, `coefficientOfVariation`, `daysBetween` e
`addDays` vivem em `api/src/lib/stats.ts`, e não dentro de um dos módulos,
porque são usados tanto aqui quanto pelas anomalias do check-up mensal
(ver [`monthly-report.md`](./monthly-report.md)).

## Onde olhar

| Assunto | Arquivo |
|---|---|
| Contrato HTTP | `.claude/docs/api/classification.md` |
| Telas | `.claude/docs/frontend/rules.md` |
| Sync do Open Finance (quem chama `suggest()` para as novas) | `.claude/docs/domain/open-finance.md` |
| Camada de IA | `.claude/docs/api/llm.md` |
| Código | `api/src/modules/classification/` |

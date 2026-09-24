---
title: Página /rules — Classificação
area: frontend
updated: 2026-09-23
---

## Visão geral

Rota `/rules`, item "Classificação" na sidebar. Duas abas num único
`SegmentedControl`, porque as duas tratam do mesmo assunto (o que o motor sabe
sobre as descrições do extrato) e não justificam dois itens de navegação:

- **Regras** — CRUD do motor de classificação, com preview ao vivo.
- **Recorrentes** — cobranças detectadas, agrupadas por status.

Arquivo: `app/src/pages/Rules/index.tsx` (lazy em `App.tsx`).
Domínio: `.claude/docs/domain/classification.md`.

## Aba Regras

Tabela com busca (padrão ou nome), filtro por origem e botão "Nova regra".

| Coluna | Conteúdo |
|---|---|
| Padrão | `pattern` em fonte monoespaçada + resumo legível do que a regra aplica |
| Aplica | Tipo de match e prioridade |
| Origem | Badge `padrão` / `manual` / `aprendida` (esta em esmeralda) |
| Usos | `hitCount`; o título mostra quando foi a última vez |

O resumo ("renomeia para X · Moradia · Boleto · gasto fixo") evita uma tabela de
8 colunas para campos que quase sempre estão vazios.

Ações por linha, reveladas no hover (sempre visíveis no toque): ligar/desligar,
editar e excluir. Regra desligada fica esmaecida em vez de sumir — desligar não
é apagar, e o diálogo de exclusão diz isso.

### Modal de criar/editar

Campos: padrão, tipo de match, prioridade, renomear para, categoria, forma de
pagamento e recorrência. Todos exceto o padrão aceitam "Não definir" — a regra
aplica só o que preencher.

**Preview ao vivo**: `POST /classification/rules/test` com debounce de 400ms
mostra quantas transações do histórico casariam e lista as primeiras, com data
e valor. É o que impede criar uma regra genérica demais sem perceber.

Editar uma regra `aprendida` preserva sua origem; para promovê-la a manual,
basta salvar com a origem alterada.

## Aba Recorrentes

Escopo único: todas as transações do Open Finance.

**Cabeçalho em destaque**: total mensal normalizado das séries `ACTIVE`, com a
contagem e a explicação de que valores semanais e anuais já foram convertidos
para o mês. Botão "Recalcular" ao lado.

Cards agrupados por status (`Ativa`, `Atrasada`, `Encerrada`), cada grupo com um
ponto colorido e a contagem. Cada card traz:

- label e categoria, ciclo (`Mensal`, `Anual`…);
- custo mensal normalizado em destaque;
- badge vermelho `+18%` quando há aumento de preço, com a data no título;
- número de cobranças, última cobrança e próxima prevista (só em `ACTIVE`);
- ação "não é recorrente" (dismiss) no hover.

O estado vazio explica o critério de detecção (3+ cobranças, intervalos
regulares, valores parecidos) em vez de só dizer "nada aqui" — sem isso o
usuário não sabe por que sua assinatura não apareceu.

## Camada de dados

`api.classification.*` e `api.recurring.*` em `lib/api.ts`. Chaves em
`lib/queries.ts`:

```ts
classification: { all, rules(params) }
recurring:      { all, list(params) }
```

Hooks: `useRules`, `useCreateRule`, `useUpdateRule`, `useToggleRule`,
`useDeleteRule`, `useTestRule`, `useRecurring`, `useRecalculateRecurring`,
`useDismissRecurring`.

`useTestRule` é `useMutation` (POST com corpo, não deve cachear). Toda escrita
invalida `keys.classification.all` ou `keys.recurring.all`.

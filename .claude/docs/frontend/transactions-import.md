---
title: Frontend — Importação de extrato CSV em Transações
area: frontend
updated: 2026-07-01
---

## Visão geral

Botão "Importar CSV" no cabeçalho de Transações (`pages/Transactions/index.tsx`) abre `ImportModal` (`pages/Transactions/ImportModal.tsx`), um wizard de 3 etapas (Arquivo → Configurar → Revisar) que lê um extrato bancário no formato do Nubank, mostra uma tabela de revisão editável e importa tudo via `POST /transactions/bulk` (ver `.claude/docs/api/transactions.md`).

## Formato esperado do CSV

Cabeçalho com colunas `Data` (dd/mm/aaaa), `Valor`, `Identificador` (id único do banco, opcional) e `Descrição` (vira o nome da transação). Ordem das colunas não importa — a busca é pelo nome do cabeçalho.

### Sinal do `Valor` no extrato vs. no domínio interno

O extrato do Nubank usa: **negativo = saída (despesa)**, **positivo = entrada**. O domínio interno da transação (ver `.claude/docs/domain/transaction.md`) usa o **oposto**: positivo = despesa, negativo = entrada.

`parseStatementCsv()` devolve o valor cru do arquivo (sem inverter). O `ImportModal` já separa isso em `amount` (magnitude, sempre positiva) + `isIncome` (boolean) por linha — mesmo padrão do botão redondo usado em "Nova transação" (`TransactionModal`, no mesmo arquivo `Transactions/index.tsx`). A conversão pro sinal do domínio acontece só em `handleImport`:

```ts
amount: r.isIncome ? -r.amount : r.amount // isIncome=true → negativo (entrada); false → positivo (despesa)
```

Histórico: em uma versão anterior o valor ia direto pra API sem essa separação, e ficou invertido — uma "Transferência Recebida" (entrada) virava uma despesa gigante no saldo, e uma saída virava entrada. Corrigido em 2026-07-01 ao trocar o input numérico livre pelo par magnitude+toggle (mesmo componente visual do formulário normal), que elimina a ambiguidade de sinal.

## Parsing (`pages/Transactions/csv.ts`)

- `parseCsv()` — parser CSV genérico (RFC4180) escrito à mão (sem dependência nova), lida com campos entre aspas contendo vírgulas (comum em descrições de boleto, ex: `"Pagamento... AYMORE CREDITO, FINANCIAMENTO..."`).
- `parseStatementCsv()` — mapeia as colunas por nome (`data`, `valor`, `identificador`, prefixo `descri` para cobrir "descrição" mesmo com encoding quebrado), converte `dd/mm/aaaa` → ISO, e lança `CsvImportError` com mensagem amigável (linha e valor problemático) em caso de data/valor inválido ou cabeçalho não reconhecido. Não inverte sinal — devolve o valor cru do arquivo.
- Leitura do arquivo via `File.text()` (decodifica UTF-8 por padrão — o export real do Nubank é UTF-8).

## Fluxo do `ImportModal` (3 etapas)

Estado `step: "file" | "configure" | "review"`, indicador visual no topo do modal. Não há checkbox de incluir/excluir linha — toda linha em `rows` entra na importação; remover é só o botão de lixeira (`removeRow`), que tira a linha do array.

**Conta vale para o extrato inteiro** (campo único na etapa "Configurar", sem override por linha — todo lançamento de um extrato bancário sai da mesma conta). **Categoria e forma de pagamento são por linha**, na tabela de revisão. A diferença entre as duas: categoria nunca tem um valor plausível pré-preenchido (lançamentos de tipos muito diferentes num mesmo extrato), mas forma de pagamento normalmente é a mesma pra quase tudo — por isso a etapa "Configurar" tem uma "Forma de pagamento padrão" que **semeia** todas as linhas (`goToReview`) e cada linha continua editável individualmente na revisão, pra exceções (ex.: um Pix avulso no meio de um extrato de cartão).

1. **Arquivo** — dropzone (clique ou arraste o `.csv`) → parse imediato → linhas viram `DraftRow[]` (`amount`/`isIncome` derivados do sinal cru do CSV, sem categoria/forma de pagamento ainda). Sucesso avança automaticamente para "Configurar"; erro de parse mostra mensagem e mantém nesta etapa. Se o usuário voltar pra esta etapa sem escolher um novo arquivo, um botão "Próximo" reaparece pra continuar com os dados já lidos.
2. **Configurar** — resumo (quantidade de linhas, período coberto, saldo líquido do período no sinal do extrato), **Conta de destino** (obrigatória, único gate pra avançar) e **Forma de pagamento padrão** (semeia as linhas, mas não bloqueia avançar):
   - Conta: a conta marcada como padrão (`useDefaultAccount()`, mesmo hook do `TransactionModal`) → `accountId`. Pré-selecionada via `useEffect` assim que a query carrega (só seta se `accountId` ainda estiver vazio).
   - Forma de pagamento padrão: como a lista agora é fixa (ver `.claude/docs/domain/transaction.md`), não precisa mais buscar nada — `defaultPaymentMethod` já nasce como o literal `"credit_card"` (`useState<PaymentMethod>("credit_card")`), sem efeito nem query.
3. **Revisar** — tabela larga (grid com colunas `1fr` para descrição/categoria/forma de pagamento, sem `min-width` fixo, evita scroll horizontal em telas normais): data, descrição, valor (input de magnitude + botão redondo de entrada/despesa, igual ao `TransactionModal`), categoria, forma de pagamento (`Select` populado por `PAYMENT_METHOD_ORDER`/`PAYMENT_METHOD_LABELS`, pré-preenchida pelo padrão da etapa anterior, editável por linha), botão remover linha. Cabeçalho da tabela é `sticky` durante o scroll vertical.

Navegação: "Voltar" reaparece a partir da 2ª etapa; "Cancelar" sempre fecha e reseta tudo (`accountId` volta a ser pré-preenchido pelo efeito; `defaultPaymentMethod` volta ao literal `"credit_card"`).

Validação (`canImport`, etapa Revisar): precisa de conta selecionada, e toda linha precisa ter nome, data, valor > 0, categoria **e** forma de pagamento (por linha — `r.paymentMethod`, não o padrão da etapa 2).

Importar chama `useBulkCreateTransactions()` → `POST /transactions/bulk`, usando `r.paymentMethod` de cada linha (o `defaultPaymentMethod` da etapa Configurar só existe pra semear; não é usado direto no payload).

## Defaults aplicados a toda importação

Não há campo na UI para isso — é fixo por linha:
- `recurrence: "variable"` (nunca fixo, evita exigir `budgetId` por linha)
- `isEssential: true`
- `notes`: `"Importado via CSV — ID {identificador}"` quando o CSV tem identificador (serve de rastro para achar duplicatas manualmente via busca; não há deduplicação automática)

Se o usuário quiser mudar essencial/recorrência de uma linha importada, edita a transação normalmente depois (`TransactionModal` já existente).

## Limitações conhecidas (não implementadas)

- Sem deduplicação automática por `Identificador` — reimportar o mesmo período cria linhas duplicadas.
- Sem suporte a outros formatos de banco além do layout Nubank (`Data,Valor,Identificador,Descrição`).

# Importação de extratos pela linha de comando

`api/src/db/import-statements.ts` — carrega vários extratos CSV de uma vez, pelo
mesmo caminho que o `ImportModal` usa na UI (ver
`.claude/docs/frontend/transactions-import.md`), só que sem revisão manual.

Existe porque a UI importa **um arquivo por vez e exige revisar linha a linha** —
inviável para carregar meses de histórico de uma sentada.

## Uso

```bash
cd api
bun run import:csv <conta> <arquivo.csv> [...]

# exemplo: todo o histórico do Nubank
bun run import:csv Nubank ../NU_*.csv
```

A conta é resolvida **pelo nome** — o script falha se não existirem,
nunca cria nada implicitamente.

## O que ele faz

1. **Parse** — mesmo parser RFC4180 do frontend, espelhado em TypeScript puro
   (colunas `Data`, `Valor`, `Identificador`, `Descrição` do extrato Nubank).
2. **Dedupe** — pula qualquer linha cujo `Identificador` já apareça em
   `transactions.notes` na marca `Importado via CSV — ID <uuid>`, a mesma que o
   `ImportModal` grava. Vale também dentro do próprio lote, então extratos com
   meses sobrepostos podem ser passados juntos sem medo.
3. **Classificação** — chama `suggest()` do módulo de classificação com as três
   camadas (regras → histórico → IA), exatamente como a UI. Imprime as estatísticas
   por camada ao final.
4. **Insert** — lote único em transação; se uma linha falhar, nenhuma entra.

## Convenções aplicadas

| Campo | Regra |
|---|---|
| `amount` | Sinal **invertido** em relação ao extrato: o domínio usa positivo = despesa, negativo = entrada (ver `domain/transaction.md`). `forceIncome` da classificação sobrepõe o sinal do extrato — é o caso do "Aplicação RDB". |
| `categoryId` | O que a classificação sugerir; sem sugestão, cai em **Outros**. |
| `paymentMethod` | O que a classificação sugerir; sem sugestão, `pix`. |
| `isEssential` | Entrada nunca é essencial. Na saída, vale o que a classificação disse (`false` quando nenhuma camada opinou). |
| `recurrence` | O que a classificação sugerir; sem sugestão, `variable`. |
| `notes` | `Importado via CSV — ID <identificador>` — é o que torna a importação idempotente. |

## O que ele NÃO faz

- **Não mexe no saldo das contas.** O extrato é fluxo; saldo é patrimônio e é
  editado na página de Contas. (O `POST /transactions/bulk` da API *ajusta* o
  saldo — o script não, de propósito.)
- **Não cria conta nem categoria.**
- **Não revisa.** O que a classificação não resolver fica em "Outros" e precisa
  ser ajustado depois em `/transactions`.

## Divergência conhecida com o `ImportModal`

O modal grava `isEssential: !isIncome` — ou seja, marca **toda despesa como
essencial**, ignorando o `isEssential` que a própria classificação sugeriu. Isso
distorce a leitura 50/30/20 da página de Orçamento. O script usa a sugestão.
Ver `app/src/pages/Transactions/ImportModal.tsx` (`handleImport`).

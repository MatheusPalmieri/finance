---
title: Design tokens e paleta de cor
area: frontend
updated: 2026-06-24
---

## Visão geral

O app tem **duas camadas de cor**, cada uma com um consumidor distinto. Nenhum
valor hex deve ser escrito solto fora dessas duas fontes.

| Camada | Arquivo | Consumido por |
|--------|---------|---------------|
| Tokens de tema | `app/src/index.css` (`:root` / `.dark`) | classes Tailwind (`bg-primary`, `text-muted-foreground`, `bg-chart-1`…) |
| Paleta de dados | `app/src/lib/tokens.ts` | estilos inline `style={{}}`, fills do Recharts, cores gravadas no banco |

Motivo da divisão: cores de entidades (`category.color`, `account.color`) e do
seletor de cor são **hex gravados no banco**, e Recharts/inline exigem string —
logo a paleta de dados vive em JS. Os tokens de tema (incluindo o acento da marca)
vivem no CSS e mudam com o modo claro/escuro.

## Acento da marca

Identidade **verde patrimônio (esmeralda)**. Definido em `index.css`:

- `--primary` / `--ring` / `--sidebar-primary` / `--sidebar-ring` → esmeralda
  - claro: `oklch(0.6 0.13 163)`
  - escuro: `oklch(0.7 0.14 162)` (mais clara para contraste)
- `--chart-1..5` deixaram de ser grayscale e agora espelham a `CHART_PALETTE`.

Como o app só registra **despesas**, verde não colide com a convenção
verde=receita: despesas usam vermelho / sinal negativo, e o verde fica livre como
cor de marca e de crescimento (investimentos).

## `lib/tokens.ts` — fonte única de dados

- `PALETTE` — escala nomeada de hex (emerald, blue, indigo, …). **Único lugar com hex.**
- `FINANCE` — cores semânticas de negócio com significado fixo:
  `essential` (amber), `nonEssential` (violet), `fixed` (indigo), `variable` (teal),
  `expense` (red), `income` (emerald), `neutral` (gray).
- `CHART_PALETTE` — ordem das séries de gráfico (lidera com esmeralda).
- `PICKER_SWATCHES` + `DEFAULT_PICKER_COLOR` — única lista de swatches do seletor
  de cor (antes duplicada em `ColorEntityCrud` e `Accounts`).
- `tint(color, percent = 12)` — fundo translúcido via `color-mix`. Substitui o
  padrão frágil `${color}1a` (que exigia hex de 6 dígitos).

`lib/charts.ts` reexporta `CHART_PALETTE` de tokens; `types/finance.ts` deriva
`ACCOUNT_TYPE_HEX`, `BUDGET_TYPE_HEX` e `INVESTMENT_TYPE_HEX` de `PALETTE`/`FINANCE`.

## Regras ao adicionar cor

1. Cor com significado de negócio → adicione em `FINANCE`.
2. Nova cor base → adicione em `PALETTE` e referencie a partir dela.
3. Precisa de fundo translúcido → use `tint(cor)`, nunca concatene `${cor}1a`.
4. Cor reativa ao tema (muda no dark) → token no `index.css`, consumida por classe Tailwind.
5. **Nunca** escreva hex inline em página/componente.

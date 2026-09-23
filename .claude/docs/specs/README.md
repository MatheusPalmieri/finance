---
title: Specs de produto — índice
area: specs
updated: 2026-09-23
---

## O que tem aqui

Specs de funcionalidades **propostas**, cada uma escrita para ser implementada
de forma independente. Toda spec traz: estado atual do código, schema de banco,
módulo backend, contrato de API, telas, algoritmos, testes, fases de
implementação e critérios de aceite.

| Spec | O que entrega | Precisa de IA? | Status |
|---|---|---|---|
| [`00-llm-provider.md`](./00-llm-provider.md) | Interface `LlmProvider` com adapters Ollama / Anthropic / mock | — (é a base) | ✅ implementada |
| [`01-smart-categorization.md`](./01-smart-categorization.md) | Classificação em 3 camadas que aprende com as correções + detecção de assinaturas | Opcional (camada 3) | ✅ implementada |
| [`02-monthly-checkup.md`](./02-monthly-checkup.md) | Relatório mensal: 50/30/20, anomalias, insights e narrativa | Opcional (só o texto) | ✅ implementada |
| [`03-cashflow-simulator.md`](./03-cashflow-simulator.md) | Projeção Monte Carlo do saldo e veredito "posso comprar?" | Opcional (só o parser de frase) | ✅ implementada |
| [`04-open-finance.md`](./04-open-finance.md) | Open Finance (Pluggy) como fonte primária: sync de transações, saldo e investimentos ao vivo | Não | ✅ implementada |

**As quatro specs estão implementadas.** Docs: `.claude/docs/api/llm.md`,
`.claude/docs/domain/classification.md`, `.claude/docs/domain/monthly-report.md`
e `.claude/docs/domain/forecast.md`.

## Dependências

```
00 ──┬── 01 (camada LLM; fases 1–4 e 6 não dependem)
     ├── 02 (narrativa; o resto do relatório não depende)
     └── 03 (parser de frase; o motor inteiro não depende)

01 ┈┈> 02 (opcional: alimenta a seção de assinaturas e o merchantKey)
```

Nenhuma spec depende de outra para funcionar. A seta pontilhada é
enriquecimento, não bloqueio.

## Ordem recomendada

1. **01** — melhora o uso diário e limpa a base de dados que as outras consomem.
2. **02** — barata e torna o valor da IA visível.
3. **03** — o maior diferencial do produto.

Quem quiser o caminho mais curto até algo útil: fases 1–2 da **03** (motor de
projeção + gráfico) não precisam de IA nenhuma e entregam a resposta para "vou
fechar o mês no azul?".

## Regras comuns às três

- **O LLM nunca calcula.** Todo número vem de SQL ou de TypeScript
  determinístico; o modelo classifica, narra ou preenche formulário.
- **Nada quebra sem IA.** Toda rota que usa LLM responde `aiAvailable: boolean`
  e degrada conforme descrito em cada spec.
- **Dados de teste vão na conta sandbox `Claude`** (regra do `CLAUDE.md`).
- **Toda fase é commitável** e deixa o app funcionando.
- **Doc junto com o código** — cada spec lista os docs de `.claude/docs/` a
  criar. Ver a regra de documentação no `CLAUDE.md`.

## Ao terminar uma spec

Mudar o `status:` do frontmatter de `PROPOSTO` para `IMPLEMENTADO`, criar os
docs definitivos listados nos critérios de aceite, e atualizar a lista em
`CLAUDE.md`.

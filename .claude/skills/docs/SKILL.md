# Docs Skill

Gerencia a documentação do projeto em `.claude/docs/`.

## Quando usar

Invoque `/docs` quando o usuário pedir para:
- Ler ou consultar documentação existente
- Criar uma nova página de documentação
- Atualizar ou corrigir documentação existente
- Listar o que já foi documentado

---

## Localização

Toda documentação fica em `.claude/docs/` relativo à raiz do monorepo.  
Estrutura esperada:

```
.claude/docs/
├── domain/        # Domínio de negócio: entidades, regras, fluxos
├── api/           # Rotas, contratos, autenticação
├── frontend/      # Componentes, páginas, design system
├── infra/         # Banco, env vars, deploy
└── decisions/     # ADRs e decisões técnicas relevantes
```

Arquivos que ainda não existem dentro dessas pastas devem ser criados conforme a necessidade.

---

## Formato padrão de um doc

Todo arquivo de documentação deve seguir este template:

```markdown
---
title: <título humano>
area: domain | api | frontend | infra | decisions
updated: YYYY-MM-DD
---

## Visão geral

<1-3 parágrafos descrevendo o que este doc cobre>

## <Seção 1>

...

## <Seção N>

...
```

---

## Como ler docs

1. Liste os arquivos em `.claude/docs/` com `find .claude/docs -name "*.md"`.
2. Leia o arquivo relevante com o Read tool.
3. Responda ao usuário com base no conteúdo atual — não invente nada que não esteja documentado.

## Como criar um doc

1. Identifique a área (`domain`, `api`, `frontend`, `infra`, `decisions`).
2. Escolha um nome de arquivo em kebab-case que descreva o tema (ex: `entities-overview.md`).
3. Escreva o conteúdo seguindo o template acima com `updated: <data de hoje>`.
4. Use o Write tool para criar o arquivo em `.claude/docs/<area>/<nome>.md`.
5. Confirme ao usuário onde o arquivo foi salvo.

## Como atualizar um doc

1. Leia o arquivo atual com o Read tool.
2. Aplique as alterações com o Edit tool.
3. Atualize o campo `updated:` no frontmatter para a data de hoje.
4. Informe ao usuário o que mudou.

---

## Regras

- Nunca invente documentação — escreva apenas o que o usuário forneceu ou o que você observou no código.
- Se uma informação for incerta, marque com `> **A confirmar:** <dúvida>` no doc.
- Mantenha docs curtos e factuais. Prefira listas e tabelas a parágrafos longos.
- Se o usuário pedir para documentar algo e não der detalhes suficientes, pergunte antes de escrever.

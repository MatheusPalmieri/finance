// Preload dos testes (ver bunfig.toml).
//
// Roda ANTES de qualquer arquivo de teste, portanto antes de `src/db/index.ts`
// ser importado — que lê `DATABASE_URL` no momento do import. É o que garante
// que nenhum teste toque o banco de desenvolvimento.

import { resolveTestDatabaseUrl } from "./env"

process.env.DATABASE_URL = resolveTestDatabaseUrl()

// A IA nunca é chamada de verdade nos testes: quem precisa dela injeta o
// provedor mock com `__setLlm()`. Sem isto, um Ollama rodando na máquina faria
// os testes saírem pela rede e ficarem lentos e instáveis.
process.env.LLM_PROVIDER = "mock"
process.env.LLM_ENABLED = "true"

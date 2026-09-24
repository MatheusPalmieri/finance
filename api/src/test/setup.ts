// Preload dos testes (ver bunfig.toml).
//
// Roda ANTES de qualquer arquivo de teste, portanto antes de `src/db/index.ts`
// ser importado — que lê `DATABASE_URL` no momento do import. É o que garante
// que nenhum teste toque o banco de desenvolvimento.

import { resolveTestDatabaseUrl } from "./env"

process.env.DATABASE_URL = resolveTestDatabaseUrl()

// A IA nunca é chamada de verdade nos testes: quem precisa dela injeta o
// dublê com `__setLlm()` (src/test/mocks/llm.ts). O app em execução não aceita
// provedor fake, então o default aponta para um Ollama inalcançável — sem isto,
// um Ollama rodando na máquina faria os testes saírem pela rede.
process.env.LLM_PROVIDER = "ollama"
process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1"
process.env.LLM_ENABLED = "true"

// O Open Finance também nunca sai pela rede nos testes: sem credenciais o
// módulo se considera "não configurado", e quem precisa dele injeta o
// dublê com `__setProvider()` (src/test/mocks/open-finance.ts). Sem isto, as credenciais reais do
// api/.env fariam um teste de rota sincronizar com a Pluggy de verdade.
process.env.PLUGGY_CLIENT_ID = ""
process.env.PLUGGY_CLIENT_SECRET = ""
process.env.PLUGGY_ITEM_IDS = ""

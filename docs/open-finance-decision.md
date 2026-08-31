# Decisão técnica — Provedor de Open Finance

**Data:** 2026-08-30
**Contexto:** app de finanças pessoais, uso local, único usuário, **somente leitura**
de contas, saldos e transações. Sem pagamentos, Pix, iniciação de transação ou
compartilhamento com terceiros. Stack: Bun + Elysia + TypeScript + PostgreSQL +
Drizzle. Frontend React/Vite mantido.

## Opção descartada de imediato: integração direta com o Open Finance regulado

Conectar diretamente à malha do Open Finance Brasil exige:

- ser **instituição participante** habilitada pelo Banco Central
  (`bcb.gov.br/estabilidadefinanceira/openfinance_participantes`);
- certificados **ICP-Brasil / OpenFinance** (transport + signing) e mTLS;
- conformidade **FAPI 1 Advanced** (par, private_key_jwt, JARM) — ver
  `specs-seguranca/open-banking-brasil-financial-api-1_ID3-ptbr.md`;
- registro no diretório de participantes, Dynamic Client Registration, gestão de
  consentimento com ciclo de vida e webhooks obrigatórios.

Nada disso é compatível com um projeto pessoal rodando em `localhost`. A saída é
um **agregador** que já é participante regulado e expõe uma API REST simples.

## Candidatos avaliados

| Critério | **Pluggy** | **Belvo** |
|---|---|---|
| Compatível com Bun / REST puro | Sim — API REST + `fetch`, sem SDK obrigatório | Sim — API REST, mas SDK/documentação priorizam Python/Node legado |
| Open Finance regulado no Brasil | Sim, participante; produto "Open Finance regulado" documentado (`docs.pluggy.ai/docs/open-finance-regulated`) | Sim, participante; foco histórico em México/Colômbia, Brasil mais recente |
| Leitura de contas e transações | `/accounts` (paginação por página) + `/v2/transactions` (paginação por cursor) com categorização | `/accounts`, `/transactions`, `/owners` |
| Sandbox | "Pluggy Bank" e conectores sandbox dedicados, credenciais de teste fixas | Sandbox com instituições fictícias |
| Simplicidade para uso pessoal | Alta — `clientId/clientSecret` → `apiKey` 2h → chamadas com `X-API-KEY`; widget opcional | Média — Basic Auth com `secretId/secretPassword`, modelo de "links" |
| Documentação / estabilidade | Boa, em PT-BR, exemplos de Item/webhook claros | Boa, em PT/EN, porém mais densa |
| Custos | Free tier para desenvolvimento / sandbox; produção sob contrato | Free tier de desenvolvimento; produção sob contrato |
| Webhooks e sincronização | `item/updated`, `transactions/created`, etc., por Item | Webhooks por tipo de recurso |
| Proteção de credenciais | Credenciais bancárias trafegam via widget/endpoint e **não** retornam; nada sensível persiste no nosso lado | Semelhante |
| Troca futura | Isolada atrás de `OpenFinanceProvider` | idem |

## Decisão: **Pluggy**

### Justificativa

1. **Modelo de credencial mais simples** para backend Bun: um par
   `clientId/clientSecret` gera um `apiKey` de curta duração; todas as chamadas
   são `fetch` com header `X-API-KEY`. Sem SDK, sem dependência nativa.
2. **Sandbox pronto** ("Pluggy Bank", connector `2`) com credenciais de teste
   fixas — dá para validar todo o fluxo sem banco real e sem inventar dados.
3. **Documentação em português** e orientada a "Item" (conexão), que casa
   diretamente com o nosso modelo de `open_finance_connections`.
4. As **chaves já estão provisionadas** no `.env` do projeto.
5. Continua **regulado**: o produto Open Finance da Pluggy usa a malha oficial;
   trocar para o fluxo regulado é mudar o `connectorId`, não a arquitetura.

### Desvantagens aceitas

- Lock-in de formato de payload — mitigado pela interface `OpenFinanceProvider`
  e pela coluna `raw_payload` preservada em todas as tabelas.
- `apiKey` de 2h exige renovação — resolvido com cache + renovação automática aos
  90 min dentro do `PluggyProvider`.
- A API evolui (o `GET /transactions` por página foi descontinuado em favor de
  `GET /v2/transactions` por cursor) — mitigado por manter o cliente Pluggy num
  único arquivo (`providers/pluggy.ts`) atrás da interface.
- Categorização e sinal de valor podem variar entre conectores — a normalização
  (`normalize.ts`) centraliza a conversão e é coberta por testes.

### Como trocar por Belvo no futuro

1. Criar `api/src/modules/open-finance/providers/belvo.ts` implementando
   `OpenFinanceProvider`.
2. Registrar em `getProvider()` (`provider.ts`).
3. Ajustar variáveis de ambiente (`OPEN_FINANCE_PROVIDER=belvo` + credenciais).

Nenhuma mudança em schema, rotas, serviço ou frontend.

## Referências consultadas

- Banco Central — visão geral: <https://www.bcb.gov.br/meubc/faqs/s/open-finance>
- Banco Central — participantes e requisitos:
  <https://www.bcb.gov.br/estabilidadefinanceira/openfinance_participantes>
- Portal do desenvolvedor Open Finance Brasil:
  <https://openfinancebrasil.atlassian.net/wiki/spaces/OF/overview>
- Especificações oficiais: <https://github.com/OpenBanking-Brasil/openapi>
- Segurança FAPI:
  <https://github.com/OpenBanking-Brasil/specs-seguranca/blob/main/open-banking-brasil-financial-api-1_ID3-ptbr.md>
- Pluggy — Open Finance regulado: <https://docs.pluggy.ai/docs/open-finance-regulated>
- Pluggy — transações: <https://docs.pluggy.ai/docs/transactions>
- Pluggy — criação de conexão (Item): <https://docs.pluggy.ai/docs/creating-an-item>
- Belvo — API: <https://developers.belvo.com/pt-br/apis/belvoopenapispec>

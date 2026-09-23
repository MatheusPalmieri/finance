---
title: Spec 04 — Open Finance (Pluggy) como fonte primária
area: specs
updated: 2026-09-23
---

## Visão geral

Conectar a conta Meu Pluggy do usuário e tornar o Open Finance a **fonte
primária** das transações. Lançamento manual e CSV continuam como
complementares. Todo o processamento é no backend: o frontend recebe dados
prontos.

Esta spec substitui a decisão de `decisions/remocao-open-finance.md`. A
implementação anterior falhou porque guardava os dados em tabelas `open_finance_*`
que **nunca alimentavam `transactions`**, e porque só rodou em sandbox.

**Status:** F0 a F3 concluídas. As carteiras foram removidas antes da F1
(`decisions/remocao-carteiras.md`).

## Decisões

| Tema | Decisão | Por quê |
|---|---|---|
| Transações | **Persistidas** em `transactions` (mais o payload bruto) | Histórico além dos 12 meses da Pluggy, edições do usuário (categoria, essencial, orçamento), IDs que mudam, e todo o motor (classificação, check-up, projeção) é SQL. A Pluggy só atualiza 1×/dia, então chamar na hora não traria dado mais novo. |
| **Saldos e posições** | **Sempre buscados na Pluggy**, nunca persistidos (decisão do usuário em 2026-09-23) | O saldo é o dado que mais muda e o que a Pluggy entrega sempre atual. A busca é rápida: contas + investimentos em paralelo levam ~130 ms, mais ~130 ms de `/auth`, que fica em cache. |
| Arquitetura | Módulo isolado `api/src/modules/open-finance/` mais um processo de sync via script. Sem microsserviço | É um usuário e um Postgres só. Dá o isolamento sem custo operacional. |
| Webhook | Fica para depois | Exige URL HTTPS pública. Sync agendado + botão resolvem. |
| Carteiras | Removidas | Ver `decisions/remocao-carteiras.md`. |

### Saldo ao vivo: regras

- `accounts.balance` deixa de ser a fonte do saldo nas contas ligadas à Pluggy.
  O backend chama `GET /accounts` e `GET /investments` a cada leitura.
- **Cache só em memória, curto** (~60 s): várias telas pedem o saldo ao mesmo
  tempo (Home, card de projeção). A `apiKey` fica em cache até perto de expirar.
- **Pluggy fora do ar:** a resposta traz `balanceAvailable: false` e a UI
  mostra "saldo indisponível". Não há valor salvo para cair de volta, porque é
  consequência direta de não persistir.
- **Sem histórico de patrimônio:** como nada é gravado, não existe gráfico de
  evolução do saldo ou dos investimentos ao longo do tempo. Se for desejado no
  futuro, exige snapshots, que são uma decisão nova.
- A projeção (spec 03) usa o saldo ao vivo como saldo de abertura.

## Achados da F0

Detalhe em `infra/pluggy-probe.md`. O que muda o desenho:

- Uma conexão Nubank com duas contas: conta corrente e cartão (mais 7 cartões
  adicionais/virtuais).
- Sinal: `amount = type === "DEBIT" ? +|v| : -|v|` nas duas contas.
- A data vem em UTC. Converter para `America/Sao_Paulo` antes de gravar.
- O cartão traz 29 **parcelas futuras** como `PENDING`: não são gasto realizado,
  mas são compromisso conhecido na projeção.
- A **fatura** aparece na conta e no cartão, e RDB/investimentos geram
  movimentos entre conta e aplicação. Os dois são **movimentos internos**, fora
  das métricas.
- Conciliação com o histórico CSV por data local + valor: **99%** (323/327).
- As descrições diferem das do CSV. As regras de classificação precisam de
  padrões para o texto da Pluggy, e a `category` da Pluggy (100% preenchida)
  entra como sinal extra.
- Investimentos: R$ 50,5k em 30 posições (CDB, FII, ações, BDR, ETF), com
  movimentações BUY/SELL/INTEREST.

## Fases

| Fase | Entrega | Status |
|---|---|---|
| F0 | `bun run pluggy:probe`: sondagem somente leitura | ✅ |
| F1 | Schema: `source`, `external_id`, `status` e `kind` (gasto/renda/interno) em `transactions`; tabelas `pluggy_items`, `pluggy_accounts` (vínculo com `accounts`) e payload bruto; conta "Nubank Cartão" | ✅ (a conta do cartão é criada pelo sync, F2) |
| F2 | Motor de sync: busca → payload bruto → projeção em `transactions`. Classificação só nas novas, campos do usuário nunca sobrescritos, idempotente com lock | ✅ `domain/open-finance.md` |
| F3 | Gatilhos: script + Agendador do Windows, botão "Sincronizar agora", sync em segundo plano quando o dado tem mais de 6 h. Incremental diário e conciliação completa semanal (exclusões) | ✅ `api/open-finance.md`, `infra/open-finance-sync.md` |
| F4 | Conciliação com o histórico CSV (dry-run, depois aplicar) | a fazer |
| F5 | Domínio: movimentos internos fora das métricas, **saldo ao vivo** no dashboard e na projeção, parcelas futuras na projeção | a fazer |
| F5b | Investimentos **ao vivo**: posições, alocação, rendimento dos CDBs, preço médio/rentabilidade pelas compras, proventos. Reserva do "posso comprar?" considera liquidez diária | a fazer |
| F6 | Frontend: página de integração (status, última sync, botão), selos de origem e de pendente | a fazer |
| F7 | Testes (provider mock + fixtures anonimizadas) e docs | contínuo |

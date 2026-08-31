# Frontend — Open Finance

Rota `/open-finance` (`app/src/pages/OpenFinance/index.tsx`), item de navegação
"Open Finance" (`nav.ts`, ícone `Link2`).

## O que a página faz

- Lista conexões com badge de status, contas externas (nome, número mascarado,
  saldo) e resumo da última sincronização.
- **Nova conexão** (`FormModal`): campo `Item ID` (widget do provedor) ou
  `Connector ID` + usuário/senha de sandbox. As credenciais de sandbox são
  enviadas ao backend e repassadas ao provedor — não ficam no estado global nem
  são persistidas.
- **Sincronizar** por conexão → `POST /connections/:id/sync`, toast com
  `criadas / atualizadas`.
- **Remover** conexão (`AlertDialog`) → cascade no backend; avisa que transações
  manuais/CSV não são afetadas.
- Expandir "Ver transações importadas" → tabela paginada
  (`GET /connections/:id/transactions`), entradas em verde.

## Camada de dados

- `app/src/lib/api.ts` → `api.openFinance.*`
- `app/src/lib/queries.ts` → `useOpenFinanceConnections`, `useOpenFinanceTransactions`,
  `useCreateOpenFinanceConnection`, `useSyncOpenFinanceConnection`,
  `useDeleteOpenFinanceConnection`. Query keys em `keys.openFinance`.
- Tipos em `app/src/types/finance.ts` (`OpenFinanceConnection`, `OpenFinanceAccount`,
  `OpenFinanceTransaction`, `OfConnectionStatus`, ...).

Nenhuma chave secreta é usada no frontend — tudo passa pelo backend.

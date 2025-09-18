import { createClient } from '@/utils/supabase/server';

export default async function Transaction() {
  const supabase = await createClient();

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('');

  if (error) {
    return (
      <div>
        <h1>Erro na consulta:</h1>
        <pre>{JSON.stringify(error, null, 2)}</pre>
      </div>
    );
  }

  return (
    <div>
      <h1>Transações ({transactions?.length || 0})</h1>
      <pre>{JSON.stringify(transactions, null, 2)}</pre>
    </div>
  );
}

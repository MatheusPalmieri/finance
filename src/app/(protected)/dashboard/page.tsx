import { createClient } from '@/utils/supabase/server';

export default async function Dashboard() {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  return (
    <div>
      <h1>Bem-vindo, {user?.email}</h1>
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </div>
  );
}

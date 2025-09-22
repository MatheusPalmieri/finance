import { ProtectedMain } from '@/components';
import { createClient } from '@/utils/supabase/server';

export default async function SettingsPage() {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  return (
    <ProtectedMain title="Settings">
      <h1>Bem-vindo, {user?.email}</h1>
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </ProtectedMain>
  );
}

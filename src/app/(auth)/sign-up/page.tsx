'use client';

import { useState } from 'react';

import { createClient } from '@/utils/supabase/client';

export default function SignInPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleRegister() {
    const firstName = name.split(' ')[0];
    const lastName = name.split(' ').slice(1).join(' ');

    const { error } = await createClient().auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });

    if (error) alert(error.message);
    else window.location.href = '/dashboard';
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3">
      <input
        className="rounded-md border p-2"
        type="text"
        placeholder="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="off"
      />
      <input
        className="rounded-md border p-2"
        type="email"
        placeholder="E-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="off"
      />
      <input
        className="rounded-md border p-2"
        type="password"
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="off"
      />
      <button
        className="rounded-md bg-green-600 px-4 py-2 text-white"
        onClick={handleRegister}
      >
        Cadastrar
      </button>
    </div>
  );
}

'use client';

import { useState } from 'react';

import Link from 'next/link';

import { createClient } from '@/utils/supabase/client';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleLogin() {
    const { error } = await createClient().auth.signInWithPassword({
      email,
      password,
    });

    if (error) alert(error.message);
    else window.location.href = '/dashboard';
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3">
      <input
        className="rounded-md border p-2"
        type="email"
        placeholder="E-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="rounded-md border p-2"
        type="password"
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button
        className="rounded-md bg-green-600 px-4 py-2 text-white"
        onClick={handleLogin}
      >
        Entrar
      </button>
      <Link
        href="/sign-up"
        className="rounded-md border border-green-600 px-4 py-2 text-green-600"
      >
        Cadastrar
      </Link>
    </div>
  );
}

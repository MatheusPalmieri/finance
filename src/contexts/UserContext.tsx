// EXEMPLO: Implementação com Context API para cache simples
'use client';

import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import { createClient } from '@/utils/supabase/client';

// EXEMPLO: Implementação com Context API para cache simples

// EXEMPLO: Implementação com Context API para cache simples

// EXEMPLO: Implementação com Context API para cache simples

// EXEMPLO: Implementação com Context API para cache simples

interface User {
  id: string;
  email?: string;
  user_metadata?: any;
  identities?: any[];
}

interface UserContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider = ({ children }: UserProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const {
        data: { user },
        error: fetchError,
      } = await createClient().auth.getUser();

      if (fetchError) {
        throw fetchError;
      }

      console.log('🚀 ~ user from Context:', user);
      setUser(user);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Erro ao buscar usuário';
      setError(errorMessage);
      console.error('Error fetching user', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();

    // Opcional: Escutar mudanças de autenticação
    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session?.user);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refetch = async () => {
    await fetchUser();
  };

  return (
    <UserContext.Provider value={{ user, isLoading, error, refetch }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUserContext = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUserContext deve ser usado dentro de UserProvider');
  }
  return context;
};

// Para usar, você precisaria envolver sua aplicação:
/*
// layout.tsx
import { UserProvider } from '@/contexts/UserContext';

export default function RootLayout({ children }) {
  return (
    <UserProvider>
      {children}
    </UserProvider>
  );
}

// Em qualquer componente:
const { user, isLoading, error, refetch } = useUserContext();
*/

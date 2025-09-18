import useSWR from 'swr';

import { createClient } from '@/utils/supabase/client';

const fetchUser = async () => {
  const {
    data: { user },
    error,
  } = await createClient().auth.getUser();

  if (error) {
    console.error('Error fetching user', error);
    throw error;
  }

  return user;
};

export const useUser = () => {
  const {
    data: user,
    error,
    isLoading,
    mutate,
  } = useSWR('supabase-user', fetchUser);

  return {
    user,
    isLoading,
    isError: !!error,
    error,

    refetch: () => mutate(),

    updateCache: (newUser: any) => mutate(newUser, false),
  };
};

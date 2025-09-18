'use client';

import { useUser } from '@/hooks/useUser';

import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

export const SidebarUser2 = () => {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
        <Avatar className="h-8 w-8 rounded-lg">
          <AvatarFallback className="rounded-lg">...</AvatarFallback>
        </Avatar>
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium">Carregando...</span>
          <span className="text-muted-foreground truncate text-xs">
            Carregando...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
      <Avatar className="h-8 w-8 rounded-lg">
        <AvatarImage
          src={
            user?.user_metadata?.avatar_url ||
            user?.identities?.[0]?.identity_data?.avatar_url
          }
          alt={
            user?.user_metadata?.name ||
            user?.identities?.[0]?.identity_data?.first_name
          }
        />
        <AvatarFallback className="rounded-lg">
          {(
            user?.user_metadata?.name ||
            user?.identities?.[0]?.identity_data?.first_name
          )
            ?.charAt(0)
            ?.toUpperCase() || 'U'}
        </AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">
          {user?.user_metadata?.name ||
            user?.identities?.[0]?.identity_data?.first_name ||
            'Usuário'}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {user?.email || 'email@exemplo.com'}
        </span>
      </div>
    </div>
  );
};

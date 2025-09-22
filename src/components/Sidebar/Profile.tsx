'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUser } from '@/hooks/useUser';

export const SidebarProfile = () => {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
        <Avatar className="h-8 w-8 rounded-full">
          <AvatarFallback className="rounded-full">...</AvatarFallback>
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
      <Avatar className="size-8">
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
        <AvatarFallback className="rounded-full">
          {(
            user?.user_metadata?.name ||
            user?.identities?.[0]?.identity_data?.first_name
          )
            ?.charAt(0)
            ?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">
          {user?.user_metadata?.name ||
            user?.identities?.[0]?.identity_data?.first_name ||
            'Usuário'}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {user?.email || 'finance@backstage.app'}
        </span>
      </div>
    </div>
  );
};
SidebarProfile.displayName = 'SidebarProfile';

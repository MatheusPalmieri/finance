'use client';

import { usePathname, useRouter } from 'next/navigation';

import { CirclePlus, type LucideIcon } from 'lucide-react';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

interface SidebarNavMainProps {
  items: {
    title: string;
    url: string;
    icon?: LucideIcon;
  }[];
}

export const SidebarNavMain = ({ items }: SidebarNavMainProps) => {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Quick Create"
              className="hover:text-primary-foreground active:text-primary-foreground min-w-8 bg-purple-600 text-white duration-200 ease-linear hover:bg-purple-700 active:bg-purple-800"
            >
              <CirclePlus />
              <span>Quick Create</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                data-active={pathname === item.url}
                onClick={() => {
                  router.push(item.url);
                }}
              >
                {item.icon && <item.icon />}
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};
SidebarNavMain.displayName = 'SidebarNavMain';

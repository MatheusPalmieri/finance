'use client';

import type { LucideIcon } from 'lucide-react';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

interface SidebarNavFooterProps
  extends React.ComponentPropsWithoutRef<typeof SidebarGroup> {
  items: {
    title: string;
    icon: LucideIcon;
  }[];
}

export const SidebarNavFooter = ({
  items,
  ...props
}: SidebarNavFooterProps) => {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton>
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};
SidebarNavFooter.displayName = 'SidebarNavFooter';

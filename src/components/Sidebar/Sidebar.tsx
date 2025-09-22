'use client';

import * as React from 'react';

import Link from 'next/link';

import {
  ChartPie,
  Landmark,
  PiggyBank,
  ReceiptText,
  Settings,
} from 'lucide-react';

import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  Sidebar as SidebarRoot,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

import { SidebarFooterMenu } from './FooterMenu';
import { SidebarNavFooter } from './NavFooter';
import { SidebarNavMain } from './NavMain';

const nav = {
  main: [
    {
      title: 'Dashboard',
      url: '/dashboard',
      icon: ChartPie,
    },
    {
      title: 'Bills',
      url: '/bills',
      icon: ReceiptText,
    },
    {
      title: 'Investments',
      url: '/investments',
      icon: Landmark,
    },
  ],
  footer: [
    {
      title: 'Settings',
      icon: Settings,
    },
  ],
};

export const Sidebar = React.memo<React.ComponentProps<typeof SidebarRoot>>(
  ({ ...props }) => {
    return (
      <SidebarRoot collapsible="offcanvas" {...props}>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <Link href="/dashboard" className="flex items-center gap-2">
                <PiggyBank
                  className={cn(
                    '!size-5 !text-purple-600',
                    'group-hover/menu-item:-translate-y-1 group-hover/menu-item:scale-110 group-hover/menu-item:-rotate-12',
                    'transition-all delay-100 duration-200'
                  )}
                />

                <span className="text-base leading-none font-semibold">
                  Back Fin.
                </span>
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarNavMain items={nav.main} />
          <SidebarNavFooter items={nav.footer} className="mt-auto" />
        </SidebarContent>

        <SidebarFooter>
          <SidebarFooterMenu />
        </SidebarFooter>
      </SidebarRoot>
    );
  }
);
Sidebar.displayName = 'Sidebar';

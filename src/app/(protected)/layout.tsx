import { Sidebar } from '@/components';
import { SidebarInset, SidebarProvider } from '@/components/ui';
import { Toaster } from '@/components/ui/sonner';
import { SWRProvider } from '@/providers';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SWRProvider>
      <SidebarProvider
        style={
          {
            '--sidebar-width': 'calc(var(--spacing) * 72)',
            '--header-height': 'calc(var(--spacing) * 12)',
          } as React.CSSProperties
        }
      >
        <Sidebar variant="inset" />
        <SidebarInset>{children}</SidebarInset>
        <Toaster />
      </SidebarProvider>
    </SWRProvider>
  );
}

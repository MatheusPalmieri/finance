import { Suspense } from "react"
import { Outlet } from "react-router-dom"
import { Loader2 } from "lucide-react"

import { usePageTitle } from "@/hooks/usePageTitle"
import { useOpenFinanceSyncWatcher } from "@/lib/queries"
import { Sidebar } from "./Sidebar"
import { MobileTopbar } from "./MobileTopbar"

export function AppLayout() {
  usePageTitle()
  // Abrir o app com dados velhos dispara o sync do Open Finance; o watcher
  // atualiza as telas quando ele termina
  useOpenFinanceSyncWatcher()

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Navegação fixa no desktop (escondida no mobile) */}
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Cabeçalho com drawer no mobile (escondido no desktop) */}
        <MobileTopbar />

        <main className="app-scroll flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {/* Fallback enquanto o chunk da rota carrega */}
            <Suspense
              fallback={
                <div className="flex h-[60vh] items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}

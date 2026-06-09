import { Suspense } from "react"
import { Outlet } from "react-router-dom"
import { Loader2 } from "lucide-react"

import { Sidebar } from "./Sidebar"

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-8">
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
  )
}

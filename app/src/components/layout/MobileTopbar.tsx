import { useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { Menu, Settings } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { useSettings } from "@/components/settings/useSettings"
import { cn } from "@/lib/utils"
import { Logo } from "./Logo"
import { MonthPicker } from "./MonthPicker"
import { isRouteActive, navItems } from "./nav"

// Cabeçalho fixo exibido apenas em telas pequenas (< lg). Abre um drawer
// lateral (Sheet) com a navegação completa. A Sidebar fixa cobre o desktop.
export function MobileTopbar() {
  const settings = useSettings()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Abrir menu de navegação"
          >
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="border-b border-sidebar-border p-4">
            <SheetTitle asChild>
              <div>
                <Logo />
              </div>
            </SheetTitle>
          </SheetHeader>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
            {navItems.map(({ to, icon: Icon, label }) => {
              const active = isRouteActive(pathname, to)
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </NavLink>
              )
            })}
          </nav>

          {/* Filtro global de mês */}
          <div className="border-t border-sidebar-border p-3">
            <MonthPicker />
          </div>
        </SheetContent>
      </Sheet>

      <Logo />

      <Button
        variant="ghost"
        size="icon"
        onClick={() => settings.open()}
        aria-label="Abrir ajustes"
      >
        <Settings />
      </Button>
    </header>
  )
}

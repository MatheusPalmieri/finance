import { useSettings } from "@/components/settings/useSettings"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { isEditableTarget } from "@/lib/keyboard"
import { cn } from "@/lib/utils"
import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react"
import { useEffect, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { Logo } from "./Logo"
import { MonthPicker } from "./MonthPicker"
import { isRouteActive, navItems, type IconType } from "./nav"

const STORAGE_KEY = "sidebar-collapsed"

export function Sidebar() {
  const settings = useSettings()
  const { pathname } = useLocation()

  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) === "true"
  )

  // Persiste o estado de colapso
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed))
  }, [collapsed])

  // Atalho de teclado: tecla "B" alterna a sidebar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditableTarget(e.target)) return
      if (e.key.toLowerCase() !== "b") return
      setCollapsed((c) => !c)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "hidden h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex",
          collapsed ? "w-18" : "w-60"
        )}
      >
        {/* Cabeçalho com a logo */}
        <div
          className={cn(
            "flex h-14 items-center border-b border-sidebar-border",
            collapsed ? "justify-center px-0" : "px-3"
          )}
        >
          <Logo collapsed={collapsed} />
        </div>

        {/* Navegação */}
        <nav className="flex flex-col gap-1 p-3">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavItem
              key={to}
              to={to}
              icon={Icon}
              label={label}
              active={isRouteActive(pathname, to)}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {/* Filtro global de mês */}
        <div className="mt-auto border-t border-sidebar-border p-3">
          <MonthPicker compact={collapsed} />
        </div>

        {/* Rodapé: ajustes + colapsar */}
        <div className="flex flex-col gap-1 border-t border-sidebar-border p-3">
          <SidebarButton
            collapsed={collapsed}
            onClick={() => settings.open()}
            tooltip="Ajustes"
            icon={
              <Settings
                size={18}
                className="shrink-0 transition-transform duration-500 group-hover:rotate-90"
              />
            }
          >
            Ajustes
            <kbd className="ml-auto rounded border border-sidebar-border bg-sidebar px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70">
              ,
            </kbd>
          </SidebarButton>

          <SidebarButton
            collapsed={collapsed}
            onClick={() => setCollapsed((c) => !c)}
            tooltip={collapsed ? "Expandir" : "Recolher"}
            icon={
              collapsed ? (
                <PanelLeftOpen size={18} className="shrink-0" />
              ) : (
                <PanelLeftClose size={18} className="shrink-0" />
              )
            }
          >
            Recolher
            <kbd className="ml-auto rounded border border-sidebar-border bg-sidebar px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70">
              B
            </kbd>
          </SidebarButton>
        </div>
      </aside>
    </TooltipProvider>
  )
}

// ── Item de navegação ────────────────────────────────────────────────────────
function NavItem({
  to,
  icon: Icon,
  label,
  active,
  collapsed,
}: {
  to: string
  icon: IconType
  label: string
  active: boolean
  collapsed: boolean
}) {
  // className como STRING (não função) — necessário para o Slot do Radix
  // (TooltipTrigger asChild) mesclar corretamente quando colapsado.
  const link = (
    <NavLink
      to={to}
      end={to === "/"}
      className={cn(
        "group flex h-10 w-full items-center rounded-lg text-sm font-medium transition-colors duration-200",
        collapsed ? "justify-center" : "gap-3 px-3",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon
        size={18}
        className="shrink-0 transition-transform duration-200 group-hover:scale-110"
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

// ── Botão genérico (ajustes / colapsar) ──────────────────────────────────────────
function SidebarButton({
  collapsed,
  onClick,
  icon,
  tooltip,
  children,
}: {
  collapsed: boolean
  onClick: () => void
  icon: React.ReactNode
  tooltip: string
  children: React.ReactNode
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex h-10 w-full items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        collapsed ? "justify-center" : "gap-3 px-3"
      )}
    >
      {icon}
      {!collapsed && (
        <span className="flex flex-1 items-center">{children}</span>
      )}
    </button>
  )

  if (!collapsed) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

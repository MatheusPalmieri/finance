import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { useTheme } from "@/components/theme-provider"
import { Logo } from "./Logo"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ArrowLeftRight,
  Building2,
  CreditCard,
  Home,
  Landmark,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PiggyBank,
  Sun,
  Tag,
  TrendingUp,
} from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"

const navItems = [
  { to: "/", icon: Home, label: "Início" },
  { to: "/transactions", icon: ArrowLeftRight, label: "Transações" },
  { to: "/accounts", icon: Landmark, label: "Contas" },
  { to: "/budgets", icon: PiggyBank, label: "Orçamento" },
  { to: "/investments", icon: TrendingUp, label: "Investimentos" },
  { to: "/categories", icon: Tag, label: "Categorias" },
  { to: "/payment-methods", icon: CreditCard, label: "Formas de pagamento" },
  { to: "/banks", icon: Building2, label: "Bancos" },
]

const STORAGE_KEY = "sidebar-collapsed"

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return !!target.closest("input, textarea, select, [contenteditable='true']")
}

// Retorna true se a rota atual corresponde ao item de navegação
function isRouteActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to)
}

export function Sidebar() {
  const { theme, setTheme } = useTheme()
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
          "flex h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
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
          {!collapsed && (
            <span className="px-3 pt-1 pb-1 text-[10px] font-semibold tracking-widest text-muted-foreground/70 uppercase">
              Navegação
            </span>
          )}

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

        {/* Rodapé: tema + colapsar */}
        <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border p-3">
          <SidebarButton
            collapsed={collapsed}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            tooltip="Alternar tema"
            icon={
              <span className="relative flex size-4.5 shrink-0 items-center justify-center">
                <Sun
                  size={18}
                  className="absolute scale-100 rotate-0 transition-all duration-300 dark:scale-0 dark:-rotate-90"
                />
                <Moon
                  size={18}
                  className="absolute scale-0 rotate-90 transition-all duration-300 dark:scale-100 dark:rotate-0"
                />
              </span>
            }
          >
            <span className="dark:hidden">Tema escuro</span>
            <span className="hidden dark:inline">Tema claro</span>
            <kbd className="ml-auto rounded border border-sidebar-border bg-sidebar px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70">
              D
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

// Tipo estrutural para ícones (lucide-react)
type IconType = React.ComponentType<{ size?: number; className?: string }>

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

// ── Botão genérico (tema / colapsar) ──────────────────────────────────────────
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
        "flex h-10 w-full items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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

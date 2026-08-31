import {
  ArrowLeftRight,
  Home,
  Landmark,
  Link2,
  PiggyBank,
  Tag,
} from "lucide-react"

// Tipo estrutural para ícones (lucide-react)
export type IconType = React.ComponentType<{ size?: number; className?: string }>

export interface NavItemDef {
  to: string
  icon: IconType
  label: string
}

// Fonte única dos itens de navegação — consumida pela Sidebar (desktop)
// e pela MobileTopbar (drawer em telas pequenas).
export const navItems: NavItemDef[] = [
  { to: "/", icon: Home, label: "Início" },
  { to: "/transactions", icon: ArrowLeftRight, label: "Transações" },
  { to: "/accounts", icon: Landmark, label: "Contas" },
  { to: "/budgets", icon: PiggyBank, label: "Orçamento" },
  { to: "/categories", icon: Tag, label: "Categorias" },
  { to: "/open-finance", icon: Link2, label: "Open Finance" },
]

// Retorna true se a rota atual corresponde ao item de navegação
export function isRouteActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to)
}

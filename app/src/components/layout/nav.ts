import {
  ArrowLeftRight,
  Cable,
  ChartPie,
  FileText,
  Home,
  ListFilter,
  PiggyBank,
  Tag,
  TrendingUp,
} from "lucide-react"

// Tipo estrutural para ícones (lucide-react)
export type IconType = React.ComponentType<{
  size?: number
  className?: string
}>

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
  { to: "/investments", icon: ChartPie, label: "Investimentos" },
  { to: "/budgets", icon: PiggyBank, label: "Orçamento" },
  { to: "/forecast", icon: TrendingUp, label: "Projeção" },
  { to: "/reports", icon: FileText, label: "Check-up" },
  { to: "/categories", icon: Tag, label: "Categorias" },
  { to: "/rules", icon: ListFilter, label: "Classificação" },
  { to: "/open-finance", icon: Cable, label: "Open Finance" },
]

// Retorna true se a rota atual corresponde ao item de navegação
export function isRouteActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to)
}

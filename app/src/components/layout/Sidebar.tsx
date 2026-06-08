import { cn } from "@/lib/utils"
import {
  BarChart3,
  Filter,
  Home,
  LayoutDashboard,
  Users,
} from "lucide-react"
import { NavLink } from "react-router-dom"

const navItems = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/clients", icon: Users, label: "Clientes" },
  { to: "/funnel", icon: Filter, label: "Funil" },
  { to: "/reports", icon: BarChart3, label: "Relatórios" },
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
]

export function Sidebar() {
  return (
    <aside className="flex h-screen w-52 shrink-0 flex-col border-r bg-background">
      <div className="flex h-14 flex-col items-start justify-center border-b px-5">
        <span className="text-sm font-semibold leading-tight tracking-tight">Odonto Reativa</span>
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">CRM</span>
      </div>

      <nav className="flex flex-col gap-0.5 p-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

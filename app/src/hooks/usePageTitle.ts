import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { isRouteActive, navItems } from "@/components/layout/nav"

const APP_NAME = "Finance"

// Atualiza o título da aba com o nome da rota atual, ex: "Categorias | Finance"
export function usePageTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    const current = navItems.find((item) => isRouteActive(pathname, item.to))
    document.title = current ? `${current.label} | ${APP_NAME}` : APP_NAME
  }, [pathname])
}

import { useEffect } from "react"
import { useLocation, useSearchParams } from "react-router-dom"
import { isRouteActive, navItems } from "@/components/layout/nav"
import { findSettingsSection } from "@/components/settings/sections"
import { SETTINGS_PARAM } from "@/components/settings/useSettings"

const APP_NAME = "Finance"

// Atualiza o título da aba com o nome da rota atual, ex: "Categorias | Finance"
export function usePageTitle() {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const settingsParam = searchParams.get(SETTINGS_PARAM)

  useEffect(() => {
    // Com os Ajustes abertos, a seção ativa dá nome à aba
    const label =
      settingsParam !== null
        ? (findSettingsSection(settingsParam)?.label ?? "Ajustes")
        : navItems.find((item) => isRouteActive(pathname, item.to))?.label
    document.title = label ? `${label} | ${APP_NAME}` : APP_NAME
  }, [pathname, settingsParam])
}

import { useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import {
  DEFAULT_SETTINGS_SECTION,
  findSettingsSection,
  type SettingsSectionId,
} from "./sections"

// Parâmetro de URL que controla o dialog — permite deep-link
// (ex: "/transactions?settings=open-finance") e o voltar do navegador
export const SETTINGS_PARAM = "settings"

// Monta o href que abre os Ajustes numa seção, preservando a rota atual
export function settingsHref(section: SettingsSectionId) {
  return `?${SETTINGS_PARAM}=${section}`
}

export function useSettings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get(SETTINGS_PARAM)
  const isOpen = raw !== null
  // Valor inválido ou vazio cai na seção padrão
  const section = findSettingsSection(raw)?.id ?? DEFAULT_SETTINGS_SECTION

  const open = useCallback(
    (next: SettingsSectionId = DEFAULT_SETTINGS_SECTION) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev)
        params.set(SETTINGS_PARAM, next)
        return params
      })
    },
    [setSearchParams]
  )

  // Trocar de seção não empilha histórico — o voltar fecha o dialog
  const select = useCallback(
    (next: SettingsSectionId) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          params.set(SETTINGS_PARAM, next)
          return params
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const close = useCallback(() => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      params.delete(SETTINGS_PARAM)
      return params
    })
  }, [setSearchParams])

  return { isOpen, section, open, select, close }
}

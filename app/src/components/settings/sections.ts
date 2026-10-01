import { lazy } from "react"
import { Cable, ListFilter, SunMoon, Tag } from "lucide-react"
import type { IconType } from "@/components/layout/nav"
import { PALETTE } from "@/lib/tokens"

export type SettingsSectionId =
  | "appearance"
  | "open-finance"
  | "rules"
  | "categories"

export interface SettingsSectionDef {
  id: SettingsSectionId
  label: string
  icon: IconType
  /** Fundo do ícone quadrado, no estilo dos Ajustes do macOS */
  color: string
  /** Termos extras para a busca da barra lateral */
  keywords: string[]
  component: React.LazyExoticComponent<React.ComponentType>
}

const AppearanceSettings = lazy(() =>
  import("./AppearanceSettings").then((m) => ({
    default: m.AppearanceSettings,
  }))
)
const OpenFinance = lazy(() =>
  import("@/pages/OpenFinance").then((m) => ({ default: m.OpenFinance }))
)
const Rules = lazy(() =>
  import("@/pages/Rules").then((m) => ({ default: m.Rules }))
)
const Categories = lazy(() =>
  import("@/pages/Categories").then((m) => ({ default: m.Categories }))
)

// Grupos da barra lateral — cada array vira um bloco separado, como no macOS
export const settingsGroups: SettingsSectionDef[][] = [
  [
    {
      id: "appearance",
      label: "Aparência",
      icon: SunMoon,
      color: PALETTE.slate,
      keywords: ["tema", "escuro", "claro", "dark", "light"],
      component: AppearanceSettings,
    },
  ],
  [
    {
      id: "open-finance",
      label: "Open Finance",
      icon: Cable,
      color: PALETTE.emerald,
      keywords: ["pluggy", "banco", "sincronizar", "contas", "sync"],
      component: OpenFinance,
    },
    {
      id: "rules",
      label: "Classificação",
      icon: ListFilter,
      color: PALETTE.blue,
      keywords: ["regras", "recorrentes", "assinaturas", "categorização"],
      component: Rules,
    },
    {
      id: "categories",
      label: "Categorias",
      icon: Tag,
      color: PALETTE.orange,
      keywords: ["categoria", "cores"],
      component: Categories,
    },
  ],
]

export const settingsSections = settingsGroups.flat()

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = "appearance"

export function findSettingsSection(id: string | null) {
  return settingsSections.find((s) => s.id === id)
}

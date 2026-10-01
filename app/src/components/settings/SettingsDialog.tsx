import { Suspense, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Loader2, Search, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { isEditableTarget } from "@/lib/keyboard"
import { cn } from "@/lib/utils"
import {
  DEFAULT_SETTINGS_SECTION,
  findSettingsSection,
  settingsSections,
  type SettingsSectionDef,
} from "./sections"
import { useSettings } from "./useSettings"

// Ajustes no estilo do macOS: janela com semáforo, busca e lista de seções à
// esquerda, conteúdo à direita. Aberto pelo parâmetro ?settings= da URL.
export function SettingsDialog() {
  const { isOpen, section, open, close } = useSettings()

  // Atalho "," abre os Ajustes (eco do ⌘, do macOS)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditableTarget(e.target)) return
      if (e.key !== ",") return
      open()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && close()}>
      {isOpen && <SettingsWindow initialSection={section} />}
    </Dialog>
  )
}

// Montado só com o dialog aberto — o estado local reinicia a cada abertura
function SettingsWindow({
  initialSection,
}: {
  initialSection: SettingsSectionDef["id"]
}) {
  const { section, select } = useSettings()
  const [query, setQuery] = useState("")
  // No mobile é lista → detalhe (como no iOS). Deep-link direto numa seção
  // abre já no detalhe.
  const [showDetail, setShowDetail] = useState(
    initialSection !== DEFAULT_SETTINGS_SECTION
  )

  const current = findSettingsSection(section) ?? settingsSections[0]
  const Content = current.component

  const items = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return settingsSections
    return settingsSections.filter((s) =>
      [s.label, ...s.keywords].some((t) => normalize(t).includes(q))
    )
  }, [query])

  function pick(id: SettingsSectionDef["id"]) {
    select(id)
    setShowDetail(true)
  }

  return (
    <DialogContent
      showCloseButton={false}
      className={cn(
        "flex gap-0 overflow-hidden p-0",
        // Mobile: tela cheia; desktop: ~80% da tela
        "h-dvh w-screen max-w-none rounded-none sm:max-w-none",
        "md:h-[80dvh] md:w-[80vw] md:rounded-2xl"
      )}
    >
      <DialogDescription className="sr-only">
        Aparência, Open Finance, classificação e categorias
      </DialogDescription>

      {/* ── Barra lateral ─────────────────────────────────────────────── */}
      <aside
        className={cn(
          "flex w-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:w-64",
          showDetail && "max-md:hidden"
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between pr-3 pl-5">
          <DialogTitle className="text-base font-semibold">Ajustes</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Fechar ajustes">
              <XIcon />
            </Button>
          </DialogClose>
        </div>

        <div className="px-3 pb-2">
          <label className="flex h-8 items-center gap-2 rounded-md bg-sidebar-accent px-2 text-muted-foreground focus-within:ring-2 focus-within:ring-sidebar-ring">
            <Search size={14} className="shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar"
              aria-label="Buscar nos ajustes"
              className="w-full bg-transparent text-sm text-sidebar-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>

        <nav
          aria-label="Seções dos ajustes"
          className="app-scroll flex-1 overflow-y-auto px-3 py-2"
        >
          {items.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              Nenhum resultado
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {items.map((s) => (
                <li key={s.id}>
                  <SectionButton
                    section={s}
                    active={s.id === current.id}
                    onClick={() => pick(s.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </nav>
      </aside>

      {/* ── Conteúdo ──────────────────────────────────────────────────── */}
      <section
        className={cn(
          "flex min-w-0 flex-1 flex-col bg-background",
          !showDetail && "max-md:hidden"
        )}
      >
        {/* Voltar para a lista (só mobile) */}
        <div className="flex h-12 shrink-0 items-center border-b border-border px-2 md:hidden">
          <button
            type="button"
            onClick={() => setShowDetail(false)}
            className="flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary"
          >
            <ChevronLeft size={18} />
            Ajustes
          </button>
        </div>

        <div className="app-scroll flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Suspense
              fallback={
                <div className="flex h-[40vh] items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <Content />
            </Suspense>
          </div>
        </div>
      </section>
    </DialogContent>
  )
}

// ── Item da lista: ícone em quadrado colorido, como no macOS ──────────────────
function SectionButton({
  section: { label, icon: Icon, color },
  active,
  onClick,
}: {
  section: SettingsSectionDef
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors max-md:min-h-11",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "hover:bg-sidebar-accent"
      )}
    >
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-white shadow-sm"
        style={{ backgroundColor: color }}
      >
        <Icon size={14} />
      </span>
      <span className="flex-1 truncate">{label}</span>
      <ChevronRight
        size={16}
        className="text-muted-foreground md:hidden"
        aria-hidden
      />
    </button>
  )
}

// Busca sem acento e sem caixa ("classificacao" acha "Classificação")
function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

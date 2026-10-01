import { Check } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

type Theme = "light" | "dark" | "system"

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Automático" },
]

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Aparência</h1>
        <p className="text-sm text-muted-foreground">
          Tema da interface. Automático acompanha o sistema operacional.
        </p>
      </div>

      {/* Bloco agrupado, como as listas dos Ajustes do macOS */}
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
          <span className="text-sm font-medium">Tema</span>
          <ToggleGroup
            type="single"
            value={theme}
            // Radix entrega "" ao clicar no item já ativo — ignora
            onValueChange={(v) => v && setTheme(v as Theme)}
            spacing={4}
            aria-label="Tema"
          >
            {OPTIONS.map((opt) => (
              <ToggleGroupItem
                key={opt.value}
                value={opt.value}
                aria-label={opt.label}
                className="group/theme h-auto flex-col gap-2 rounded-lg bg-transparent p-1 hover:bg-transparent data-[state=on]:bg-transparent"
              >
                <ThemePreview variant={opt.value} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground group-data-[state=on]/theme:font-medium group-data-[state=on]/theme:text-foreground">
                  {opt.label}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex items-center justify-between gap-4 p-4">
          <span className="text-sm font-medium">Alternar claro/escuro</span>
          <kbd className="rounded border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            D
          </kbd>
        </div>
      </div>
    </div>
  )
}

// Miniatura de janela no tema dado; "system" mostra metade de cada
function ThemePreview({ variant }: { variant: Theme }) {
  return (
    <span
      className={cn(
        "relative flex h-16 w-24 overflow-hidden rounded-lg ring-1 ring-border transition-shadow",
        "group-data-[state=on]/theme:ring-2 group-data-[state=on]/theme:ring-primary group-data-[state=on]/theme:ring-offset-2 group-data-[state=on]/theme:ring-offset-card"
      )}
    >
      {variant === "system" ? (
        <>
          <MiniWindow dark={false} className="w-1/2" />
          <MiniWindow dark className="w-1/2" />
        </>
      ) : (
        <MiniWindow dark={variant === "dark"} className="w-full" />
      )}
      <Check
        strokeWidth={3}
        className="absolute right-1 bottom-1 hidden size-4 rounded-full bg-primary p-0.5 text-primary-foreground group-data-[state=on]/theme:block"
      />
    </span>
  )
}

function MiniWindow({ dark, className }: { dark: boolean; className: string }) {
  return (
    <span
      className={cn(
        "flex h-full gap-1 p-1.5",
        dark ? "bg-neutral-800" : "bg-neutral-100",
        className
      )}
    >
      <span
        className={cn(
          "w-3 shrink-0 rounded-sm",
          dark ? "bg-neutral-700" : "bg-white"
        )}
      />
      <span className="flex flex-1 flex-col gap-1">
        <span className="h-1.5 w-2/3 rounded-full bg-primary/80" />
        <span
          className={cn(
            "h-1.5 w-full rounded-full",
            dark ? "bg-neutral-600" : "bg-neutral-300"
          )}
        />
        <span
          className={cn(
            "h-1.5 w-4/5 rounded-full",
            dark ? "bg-neutral-600" : "bg-neutral-300"
          )}
        />
      </span>
    </span>
  )
}

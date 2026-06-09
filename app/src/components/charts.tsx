import type { ComponentType, ReactNode } from "react"
import { cn } from "@/lib/utils"

// Tipo estrutural para ícones (lucide-react)
type IconType = ComponentType<{ size?: number | string; className?: string }>

// ── Card de KPI ──────────────────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  hint,
  delta,
  trend = "neutral",
  icon: Icon,
  accent,
  delay = 0,
}: {
  label: string
  value: string | number
  hint?: string
  delta?: string
  trend?: "up" | "down" | "neutral"
  icon: IconType
  accent: string
  delay?: number
}) {
  const trendColor =
    trend === "up"
      ? "text-emerald-500"
      : trend === "down"
        ? "text-rose-500"
        : "text-muted-foreground"

  return (
    <div
      className="flex animate-in flex-col gap-2 rounded-xl border bg-card p-4 duration-500 fade-in slide-in-from-bottom-2"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className="flex size-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}1a`, color: accent }}
        >
          <Icon size={15} />
        </span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold tabular-nums">{value}</span>
        {delta && (
          <span className={cn("mb-1 text-xs font-medium", trendColor)}>
            {delta}
          </span>
        )}
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

// ── Card que envolve um gráfico ───────────────────────────────────────────────
export function ChartCard({
  title,
  subtitle,
  action,
  className,
  delay = 0,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
  delay?: number
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "animate-in rounded-xl border bg-card p-5 duration-500 fade-in slide-in-from-bottom-2",
        className
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── Tooltip custom ────────────────────────────────────────────────────────────
type TooltipEntry = {
  name?: string
  value?: number | string
  color?: string
  payload?: { color?: string; fill?: string }
}

export function ChartTooltip({
  active,
  payload,
  label,
  suffix = "",
  format,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
  suffix?: string
  format?: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {label && (
        <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="size-2 rounded-full"
            style={{
              backgroundColor: p.color ?? p.payload?.fill ?? p.payload?.color,
            }}
          />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-medium text-popover-foreground tabular-nums">
            {typeof p.value === "number" && format ? format(p.value) : p.value}
            {format ? "" : suffix}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Controle segmentado (abas / período) ─────────────────────────────────────
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string; icon?: IconType }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center rounded-lg border bg-card p-0.5",
        className
      )}
    >
      {options.map((o) => {
        const Icon = o.icon
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              value === o.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {Icon && <Icon size={13} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

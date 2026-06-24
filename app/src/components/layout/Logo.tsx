import { cn } from "@/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#logo-grad)" />
      {/* Símbolo de gráfico crescente */}
      <polyline
        points="9,28 16,20 22,24 31,13"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="31" cy="13" r="2.5" fill="white" />
    </svg>
  )
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center transition-all duration-300",
        collapsed ? "gap-0" : "gap-2.5"
      )}
    >
      <LogoMark className="size-9" />
      {!collapsed && (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm leading-tight font-semibold tracking-tight">
            Finance
          </span>
          <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
            Pessoal
          </span>
        </div>
      )}
    </div>
  )
}

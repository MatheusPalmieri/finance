import { cn } from "@/lib/utils"

// Marca da Odonto Reativa: dente estilizado com um "pulso" de reativação,
// sobre um quadrado arredondado com gradiente azul→ciano.
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
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>

      {/* Base arredondada com gradiente */}
      <rect width="40" height="40" rx="11" fill="url(#logo-grad)" />

      {/* Dente estilizado: arco superior + duas raízes */}
      <path
        d="M20 10c-5 0-7.5 3-7.5 6.5 0 3.5 1.5 6 2.2 9 .3 1.5.5 3.5.9 4.9.3 1 1.6.9 1.9-.1l1.3-5.1c.2-.9 2.2-.9 2.4 0l1.3 5.1c.3 1 1.6 1.1 1.9.1.4-1.4.6-3.4.9-4.9.7-3 2.2-5.5 2.2-9C27.5 13 25 10 20 10Z"
        fill="white"
        fillOpacity="0.96"
      />
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
            Odonto Reativa
          </span>
          <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
            CRM
          </span>
        </div>
      )}
    </div>
  )
}

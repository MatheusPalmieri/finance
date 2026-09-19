import { Check, ChevronsUpDown, Settings2, Wallet } from "lucide-react"
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useActiveWallet } from "@/components/wallet-provider"
import { useWallets } from "@/lib/queries"
import { cn } from "@/lib/utils"

const ALL_LABEL = "Todas as carteiras"

/**
 * Seletor global de carteira. Fica no topo da navegação e define o escopo de
 * todo o app: as telas de Transações e Início leem só a carteira ativa, e
 * novas transações nascem atribuídas a ela.
 */
export function WalletSwitcher({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const navigate = useNavigate()
  const { walletId, setWalletId } = useActiveWallet()
  const { data: wallets } = useWallets()

  const active = wallets?.find((w) => w.id === walletId) ?? null
  const label = active?.name ?? ALL_LABEL

  // Carteira salva no localStorage que não existe mais (excluída em outro
  // lugar) — volta para "todas" em vez de filtrar por um id inválido
  useEffect(() => {
    if (walletId && wallets && !wallets.some((w) => w.id === walletId)) {
      setWalletId(null)
    }
  }, [walletId, wallets, setWalletId])

  const trigger = (
    <button
      type="button"
      aria-label={`Carteira ativa: ${label}`}
      className={cn(
        "flex h-10 w-full items-center rounded-lg border border-sidebar-border bg-sidebar-accent/40 text-sm font-medium text-sidebar-foreground transition-colors duration-200 hover:bg-sidebar-accent",
        collapsed ? "justify-center px-0" : "gap-2 px-3"
      )}
    >
      <span
        className="flex size-4.5 shrink-0 items-center justify-center rounded-full"
        style={active ? { backgroundColor: active.color } : undefined}
      >
        {active ? null : <Wallet size={16} />}
      </span>
      {!collapsed && (
        <>
          <span className="truncate">{label}</span>
          <ChevronsUpDown size={14} className="ml-auto shrink-0 opacity-60" />
        </>
      )}
    </button>
  )

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {label}
          </TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      )}

      <DropdownMenuContent
        align="start"
        side={collapsed ? "right" : "bottom"}
        className="w-56"
      >
        <DropdownMenuLabel>Carteira</DropdownMenuLabel>

        <WalletOption
          label={ALL_LABEL}
          selected={!active}
          onSelect={() => setWalletId(null)}
        />

        {wallets?.map((w) => (
          <WalletOption
            key={w.id}
            label={w.name}
            color={w.color}
            selected={w.id === active?.id}
            onSelect={() => setWalletId(w.id)}
          />
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            onNavigate?.()
            navigate("/wallets")
          }}
        >
          <Settings2 size={16} />
          Gerenciar carteiras
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function WalletOption({
  label,
  color,
  selected,
  onSelect,
}: {
  label: string
  color?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-full"
        style={color ? { backgroundColor: color } : undefined}
      >
        {color ? null : <Wallet size={14} />}
      </span>
      <span className="truncate">{label}</span>
      {selected && <Check size={14} className="ml-auto shrink-0" />}
    </DropdownMenuItem>
  )
}

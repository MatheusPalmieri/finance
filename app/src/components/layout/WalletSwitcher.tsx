import { ChevronsUpDown, Settings2, Wallet } from "lucide-react"
import { useNavigate } from "react-router-dom"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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

const EMPTY_LABEL = "Nenhuma carteira"

/**
 * Seletor global de carteira. Fica no rodapé da navegação e define o escopo de
 * todo o app: as telas de Transações e Início leem só a carteira ativa, e
 * novas transações nascem atribuídas a ela. Há sempre uma carteira ativa —
 * a lista não tem opção "todas".
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
  const label = active?.name ?? EMPTY_LABEL

  const trigger = (
    <button
      type="button"
      aria-label={`Carteira ativa: ${label}`}
      className={cn(
        "flex h-10 w-full items-center rounded-lg border border-sidebar-border bg-sidebar-accent/40 text-sm font-medium text-sidebar-foreground transition-colors duration-200 hover:bg-sidebar-accent",
        collapsed ? "justify-center px-0" : "gap-2 px-3"
      )}
    >
      {active ? (
        <span
          className="size-4.5 shrink-0 rounded-full"
          style={{ backgroundColor: active.color }}
        />
      ) : (
        <Wallet size={16} className="shrink-0" />
      )}
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
        side={collapsed ? "right" : "top"}
        className="w-56"
      >
        <DropdownMenuLabel>Carteira</DropdownMenuLabel>

        {wallets?.length ? (
          <DropdownMenuRadioGroup
            value={walletId ?? ""}
            onValueChange={setWalletId}
          >
            {wallets.map((w) => (
              <DropdownMenuRadioItem key={w.id} value={w.id}>
                <span
                  className="size-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: w.color }}
                />
                <span className="truncate">{w.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        ) : (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Nenhuma carteira cadastrada
          </p>
        )}

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

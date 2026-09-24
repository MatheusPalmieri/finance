import { useState } from "react"
import { Link } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v4"
import {
  Building2,
  CreditCard,
  DollarSign,
  Landmark,
  PiggyBank,
  Pencil,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { FormModal } from "@/components/forms/FormModal"
import { ErrorState } from "@/components/ui/error-state"
import { SnapshotStatus } from "@/components/open-finance/SnapshotStatus"
import { useAccounts, useBalances, useUpdateAccount } from "@/lib/queries"
import { formatCurrency, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { DEFAULT_PICKER_COLOR, PICKER_SWATCHES, tint } from "@/lib/tokens"
import {
  ACCOUNT_TYPE_LABELS,
  type Account,
  type AccountBalance,
  type AccountType,
} from "@/types/finance"

// ── Schema ────────────────────────────────────────────────────────────────────
// Contas nascem do Open Finance: só a aparência é editável. Tipo e saldo são
// do banco.
const schema = z.object({
  name: z.string().min(1, "Informe o nome"),
  color: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const ACCOUNT_ICONS: Record<AccountType, typeof Wallet> = {
  CHECKING: Building2,
  SAVINGS: PiggyBank,
  CREDIT_CARD: CreditCard,
  INVESTMENT: TrendingUp,
  CASH: DollarSign,
  OTHER: Wallet,
}

// ── Seção de contas (Início) ──────────────────────────────────────────────────
export function AccountsSection() {
  const [editing, setEditing] = useState<Account | null>(null)

  const { data: accounts, isLoading, isError, refetch } = useAccounts()

  // Saldo só do Open Finance (retrato salvo no banco). Conta sem retrato fica
  // sem valor — nunca um número inventado
  const { data: balances } = useBalances()
  const balanceById = new Map(
    (balances?.accounts ?? []).map((b) => [b.accountId, b])
  )
  // Saldo total = soma dos bancos. O cartão não abate daqui: a fatura tem card
  // próprio, com o valor do mês separado da dívida total
  const total = balances?.available ? balances.cash : null

  return (
    <section className="flex flex-col gap-4">
      {/* Saldo total */}
      {!isLoading && accounts && balances && (
        <div className="rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Saldo total</p>
            <SnapshotStatus meta={balances} />
          </div>
          <p
            className={cn(
              "mt-1 text-4xl font-bold tabular-nums",
              total !== null && total < 0
                ? "text-destructive"
                : "text-foreground"
            )}
          >
            {total === null ? "—" : formatCurrency(total)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {total === null ? (
              "Sem saldo do Open Finance ainda — sincronize para ver."
            ) : (
              <>
                soma dos bancos ·{" "}
                <Link
                  to="/investments"
                  className="underline underline-offset-2"
                >
                  investimentos à parte
                </Link>
              </>
            )}
          </p>
        </div>
      )}

      {/* Grid de contas */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          message="Não foi possível carregar as contas."
          onRetry={() => refetch()}
        />
      ) : accounts?.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Landmark size={40} className="text-muted-foreground/40" />
          <p className="text-muted-foreground">Nenhuma conta ainda</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            As contas aparecem sozinhas na primeira sincronização do Open
            Finance.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/open-finance">Ir para o Open Finance</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts?.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              balance={balanceById.get(account.id)}
              onEdit={() => setEditing(account)}
            />
          ))}
        </div>
      )}

      {editing && (
        <AccountModal
          open={!!editing}
          onClose={() => setEditing(null)}
          account={editing}
        />
      )}
    </section>
  )
}

// ── Card de conta ─────────────────────────────────────────────────────────────
function AccountCard({
  account,
  balance: snapshot,
  onEdit,
}: {
  account: Account
  balance?: AccountBalance
  onEdit: () => void
}) {
  const Icon = ACCOUNT_ICONS[account.type]
  const isCard = snapshot?.type === "CREDIT"
  // Cartão: valor principal é a fatura do mês; a dívida total (com parcelas
  // futuras) fica como detalhe. Sempre vermelho, sem sinal: é saída
  const monthBill = isCard ? (snapshot.monthBill ?? null) : null
  const balance = snapshot ? snapshot.balance : null
  const main = isCard ? monthBill : balance

  return (
    <div className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-card p-5 transition-shadow hover:shadow-md">
      {/* Barra de cor no topo */}
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: account.color }}
      />

      <div className="flex items-start justify-between">
        <div
          className="flex size-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: tint(account.color) }}
        >
          <Icon size={20} style={{ color: account.color }} />
        </div>

        {/* Ação: sempre visível no toque, revelada no hover no desktop */}
        <div className="flex items-center gap-1 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Editar aparência de ${account.name}`}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-7"
          >
            <Pencil size={15} className="lg:size-3.5" />
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium">{account.name}</p>
          {account.openFinance ? (
            <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              Open Finance
            </span>
          ) : (
            <span
              className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              title="Nenhuma conta do banco está vinculada a esta — ver /open-finance"
            >
              Sem vínculo
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {ACCOUNT_TYPE_LABELS[account.type]}
        </p>
      </div>

      {isCard && (
        <p className="-mb-2 text-xs text-muted-foreground">Fatura do mês</p>
      )}
      <p
        className={cn(
          "text-2xl font-bold tabular-nums",
          main === null && "text-muted-foreground",
          isCard && main !== null && "text-destructive",
          !isCard && main !== null && main < 0 && "text-destructive"
        )}
      >
        {main === null ? "—" : formatCurrency(main)}
      </p>
      {isCard && snapshot && (
        <p className="-mt-2 text-xs text-muted-foreground tabular-nums">
          dívida total {formatCurrency(snapshot.balance)}
          {snapshot.creditLimit != null &&
            ` de ${formatCurrency(snapshot.creditLimit)}`}
          {snapshot.dueDate &&
            snapshot.dueDate >= new Date().toISOString().slice(0, 10) &&
            ` · vence ${formatDate(snapshot.dueDate)}`}
        </p>
      )}
    </div>
  )
}

// ── Modal de aparência ────────────────────────────────────────────────────────
function AccountModal({
  open,
  onClose,
  account,
}: {
  open: boolean
  onClose: () => void
  account: Account
}) {
  const update = useUpdateAccount()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: account.name, color: account.color },
  })

  const selectedColor = watch("color") ?? DEFAULT_PICKER_COLOR

  const onSubmit = handleSubmit((values) => {
    update.mutate(
      { id: account.id, ...values },
      {
        onSuccess: () => {
          onClose()
          reset()
        },
      }
    )
  })

  return (
    <FormModal
      open={open}
      onClose={() => {
        onClose()
        reset()
      }}
      title="Editar conta"
      formId="account-form"
      onSubmit={onSubmit}
      isPending={update.isPending}
    >
      <div className="flex flex-col gap-4 py-1">
        <p className="text-xs text-muted-foreground">
          {ACCOUNT_TYPE_LABELS[account.type]} · tipo e saldo vêm do Open Finance
        </p>

        <div className="flex flex-col gap-1.5">
          <Label>Nome</Label>
          <Input placeholder="Ex: Nubank" {...register("name")} />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-2">
            {PICKER_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setValue("color", c)}
                aria-label={`Selecionar cor ${c}`}
                className={cn(
                  "size-9 rounded-full transition-transform hover:scale-110 sm:size-7",
                  selectedColor === c &&
                    "scale-110 ring-2 ring-ring ring-offset-2 ring-offset-background"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </FormModal>
  )
}

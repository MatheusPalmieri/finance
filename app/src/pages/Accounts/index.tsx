import { useState } from "react"
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
  Plus,
  TrendingUp,
  Trash2,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { FormModal } from "@/components/forms/FormModal"
import { ErrorState } from "@/components/ui/error-state"
import { useAccounts, useCreateAccount, useDeleteAccount, useUpdateAccount } from "@/lib/queries"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import { DEFAULT_PICKER_COLOR, PICKER_SWATCHES, tint } from "@/lib/tokens"
import { ACCOUNT_TYPE_LABELS, type Account, type AccountType } from "@/types/finance"

// ── Schema ────────────────────────────────────────────────────────────────────
const schema = z.object({
  name: z.string().min(1, "Informe o nome"),
  type: z.enum(["CHECKING", "SAVINGS", "CREDIT_CARD", "INVESTMENT", "CASH", "OTHER"]),
  balance: z.number().optional(),
  color: z.string().optional(),
  isDefault: z.boolean().optional(),
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

// ── Página ────────────────────────────────────────────────────────────────────
export function Accounts() {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [deleting, setDeleting] = useState<Account | null>(null)

  const { data: accounts, isLoading, isError, refetch } = useAccounts()
  const deleteMutation = useDeleteAccount()

  const netWorth = accounts?.reduce((sum, a) => sum + Number(a.balance), 0) ?? 0

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>
          <p className="text-sm text-muted-foreground">
            {accounts?.length ?? 0} conta{accounts?.length !== 1 ? "s" : ""} cadastrada{accounts?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm" className="gap-2">
          <Plus size={15} />
          Nova conta
        </Button>
      </div>

      {/* Patrimônio líquido */}
      {!isLoading && accounts && (
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Patrimônio líquido</p>
          <p className={cn("mt-1 text-4xl font-bold tabular-nums", netWorth >= 0 ? "text-foreground" : "text-destructive")}>
            {formatCurrency(netWorth)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">soma de todas as contas</p>
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
        <ErrorState message="Não foi possível carregar as contas." onRetry={() => refetch()} />
      ) : accounts?.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Landmark size={40} className="text-muted-foreground/40" />
          <p className="text-muted-foreground">Nenhuma conta cadastrada</p>
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            Adicionar primeira conta
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts?.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onEdit={() => setEditing(account)}
              onDelete={() => setDeleting(account)}
            />
          ))}
        </div>
      )}

      {/* Modais */}
      <AccountModal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nova conta"
      />

      {editing && (
        <AccountModal
          open={!!editing}
          onClose={() => setEditing(null)}
          title="Editar conta"
          defaultValues={editing}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.name}</strong> será removida permanentemente. As transações
              associadas não serão apagadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleting) deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Card de conta ─────────────────────────────────────────────────────────────
function AccountCard({
  account,
  onEdit,
  onDelete,
}: {
  account: Account
  onEdit: () => void
  onDelete: () => void
}) {
  const Icon = ACCOUNT_ICONS[account.type]
  const balance = Number(account.balance)

  return (
    <div className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-card p-5 transition-shadow hover:shadow-md">
      {/* Barra de cor no topo */}
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: account.color }} />

      <div className="flex items-start justify-between">
        <div
          className="flex size-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: tint(account.color) }}
        >
          <Icon size={20} style={{ color: account.color }} />
        </div>

        {/* Ações: sempre visíveis no toque, reveladas no hover no desktop */}
        <div className="flex items-center gap-1 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Editar ${account.name}`}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-7"
          >
            <Pencil size={15} className="lg:size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Excluir ${account.name}`}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive lg:size-7"
          >
            <Trash2 size={15} className="lg:size-3.5" />
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium">{account.name}</p>
          {account.isDefault && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              Padrão
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABELS[account.type]}</p>
      </div>

      <p className={cn("text-2xl font-bold tabular-nums", balance < 0 && "text-destructive")}>
        {formatCurrency(balance)}
      </p>
    </div>
  )
}

// ── Modal de criar/editar ─────────────────────────────────────────────────────
function AccountModal({
  open,
  onClose,
  title,
  defaultValues,
}: {
  open: boolean
  onClose: () => void
  title: string
  defaultValues?: Account
}) {
  const create = useCreateAccount()
  const update = useUpdateAccount()

  const { register, handleSubmit, watch, setValue, formState: { errors }, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues
      ? {
          name: defaultValues.name,
          type: defaultValues.type,
          balance: Number(defaultValues.balance),
          color: defaultValues.color,
          isDefault: defaultValues.isDefault,
        }
      : { type: "CHECKING", color: DEFAULT_PICKER_COLOR, isDefault: false },
  })

  const selectedColor = watch("color") ?? DEFAULT_PICKER_COLOR

  const onSubmit = handleSubmit((values) => {
    const finish = () => { onClose(); reset() }
    if (defaultValues) {
      update.mutate({ id: defaultValues.id, ...values }, { onSuccess: finish })
    } else {
      create.mutate(values, { onSuccess: finish })
    }
  })

  const isPending = create.isPending || update.isPending

  return (
    <FormModal
      open={open}
      onClose={() => { onClose(); reset() }}
      title={title}
      formId="account-form"
      onSubmit={onSubmit}
      isPending={isPending}
    >
      <div className="flex flex-col gap-4 py-1">
        <div className="flex flex-col gap-1.5">
          <Label>Nome</Label>
          <Input placeholder="Ex: Conta Corrente Itaú" {...register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Tipo</Label>
          <Select
            value={watch("type")}
            onValueChange={(v) => setValue("type", v as AccountType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(ACCOUNT_TYPE_LABELS) as [AccountType, string][]).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{defaultValues ? "Saldo atual (R$)" : "Saldo inicial (R$)"}</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="0,00"
            {...register("balance", { valueAsNumber: true })}
          />
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
                    "ring-2 ring-ring ring-offset-2 ring-offset-background scale-110"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Conta padrão */}
        <label className="flex cursor-pointer items-start gap-2.5">
          <Checkbox
            checked={watch("isDefault") ?? false}
            onCheckedChange={(c) => setValue("isDefault", c === true)}
            className="mt-0.5"
          />
          <span className="flex flex-col">
            <span className="text-sm font-medium">Conta padrão</span>
            <span className="text-xs text-muted-foreground">
              Pré-selecionada ao criar uma transação. Apenas uma conta pode ser padrão.
            </span>
          </span>
        </label>
      </div>
    </FormModal>
  )
}

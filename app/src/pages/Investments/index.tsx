import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v4"
import {
  CircleMinus,
  CirclePlus,
  History,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormModal } from "@/components/forms/FormModal"
import {
  useContributions,
  useCreateContribution,
  useCreateInvestment,
  useDeleteContribution,
  useDeleteInvestment,
  useInvestments,
  useUpdateInvestment,
} from "@/lib/queries"
import { computeProjection } from "@/lib/investment"
import { formatCurrency, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  INVESTMENT_TYPE_HEX,
  INVESTMENT_TYPE_LABELS,
  INVESTMENT_TYPE_ORDER,
  type Investment,
  type InvestmentMovementType,
  type InvestmentType,
} from "@/types/finance"

// ── Schema do investimento ──────────────────────────────────────────────────
const schema = z.object({
  name: z.string().min(1, "Informe o nome"),
  type: z.enum(["stock", "cdi", "fii", "treasury", "crypto", "fund"]),
  goalAmount: z.number().positive("Valor deve ser positivo").optional(),
  monthlyContribution: z.number().positive("Valor deve ser positivo").optional(),
})

type FormValues = z.infer<typeof schema>

// ── Página ────────────────────────────────────────────────────────────────────
export function Investments() {
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Investment | null>(null)
  const [deleting, setDeleting] = useState<Investment | null>(null)
  const [moving, setMoving] = useState<{
    investment: Investment
    type: InvestmentMovementType
  } | null>(null)
  const [viewingHistory, setViewingHistory] = useState<Investment | null>(null)

  const { data: investments, isLoading } = useInvestments(search || undefined)
  const deleteMutation = useDeleteInvestment()

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Investimentos</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe aportes, metas e a projeção de prazo
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm" className="gap-2">
          <Plus size={15} />
          Novo investimento
        </Button>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search
          size={14}
          className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : !investments?.length ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <TrendingUp size={40} className="text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {search ? "Nenhum investimento encontrado" : "Nenhum investimento cadastrado"}
          </p>
          {!search && (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              Criar primeiro investimento
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor atual</TableHead>
                <TableHead className="text-right">Meta</TableHead>
                <TableHead className="min-w-44">Progresso</TableHead>
                <TableHead>Previsão</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investments.map((investment) => (
                <InvestmentRow
                  key={investment.id}
                  investment={investment}
                  onDeposit={() => setMoving({ investment, type: "deposit" })}
                  onWithdraw={() => setMoving({ investment, type: "withdrawal" })}
                  onHistory={() => setViewingHistory(investment)}
                  onEdit={() => setEditing(investment)}
                  onDelete={() => setDeleting(investment)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modais */}
      {creating && (
        <InvestmentModal open onClose={() => setCreating(false)} title="Novo investimento" />
      )}

      {editing && (
        <InvestmentModal
          open
          onClose={() => setEditing(null)}
          title="Editar investimento"
          defaultValues={editing}
        />
      )}

      {moving && (
        <ContributionModal
          investment={moving.investment}
          type={moving.type}
          onClose={() => setMoving(null)}
        />
      )}

      {viewingHistory && (
        <HistoryModal investment={viewingHistory} onClose={() => setViewingHistory(null)} />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir investimento?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.name}</strong> e todo o seu histórico de aportes serão removidos
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleting)
                  deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
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

// ── Linha da tabela ───────────────────────────────────────────────────────────
function InvestmentRow({
  investment,
  onDeposit,
  onWithdraw,
  onHistory,
  onEdit,
  onDelete,
}: {
  investment: Investment
  onDeposit: () => void
  onWithdraw: () => void
  onHistory: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const color = INVESTMENT_TYPE_HEX[investment.type]
  const current = Number(investment.currentAmount)
  const goal = investment.goalAmount ? Number(investment.goalAmount) : null
  const percent = goal && goal > 0 ? Math.min(100, (current / goal) * 100) : null

  return (
    <TableRow className="group">
      {/* Nome */}
      <TableCell className="font-medium">{investment.name}</TableCell>

      {/* Tipo */}
      <TableCell>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
          {INVESTMENT_TYPE_LABELS[investment.type]}
        </span>
      </TableCell>

      {/* Valor atual */}
      <TableCell className="text-right font-semibold tabular-nums">
        {formatCurrency(current)}
      </TableCell>

      {/* Meta */}
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {goal ? formatCurrency(goal) : "—"}
      </TableCell>

      {/* Progresso */}
      <TableCell>
        {percent != null ? (
          <div className="flex flex-col gap-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${percent}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {percent.toFixed(0)}%
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Sem meta</span>
        )}
      </TableCell>

      {/* Previsão */}
      <TableCell>
        <ProjectionLabel investment={investment} />
      </TableCell>

      {/* Ações */}
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button variant="outline" size="xs" className="gap-1.5" onClick={onDeposit}>
            <CirclePlus size={13} className="text-emerald-600 dark:text-emerald-400" />
            Aporte
          </Button>
          <Button variant="outline" size="xs" className="gap-1.5" onClick={onWithdraw}>
            <CircleMinus size={13} className="text-destructive" />
            Retirada
          </Button>
          <IconButton label="Histórico de movimentos" onClick={onHistory}>
            <History size={13} />
          </IconButton>
          <IconButton label={`Editar ${investment.name}`} onClick={onEdit}>
            <Pencil size={13} />
          </IconButton>
          <IconButton label={`Excluir ${investment.name}`} variant="destructive" onClick={onDelete}>
            <Trash2 size={13} />
          </IconButton>
        </div>
      </TableCell>
    </TableRow>
  )
}

// Rótulo da projeção de prazo, com destaque para meta atingida
function ProjectionLabel({ investment }: { investment: Investment }) {
  const { projection } = investment
  if (!projection) return <span className="text-xs text-muted-foreground">—</span>

  if (projection.goalReached)
    return (
      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
        {projection.estimatedLabel}
      </span>
    )

  if (projection.estimatedMonths == null)
    return <span className="text-xs text-muted-foreground">{projection.estimatedLabel}</span>

  return <span className="text-sm">~{projection.estimatedLabel}</span>
}

// Botão de ação somente-ícone, reutilizado nas linhas
function IconButton({
  label,
  onClick,
  variant = "default",
  children,
}: {
  label: string
  onClick: () => void
  variant?: "default" | "destructive"
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
        variant === "destructive"
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

// ── Modal de criar/editar ─────────────────────────────────────────────────────
function InvestmentModal({
  open,
  onClose,
  title,
  defaultValues,
}: {
  open: boolean
  onClose: () => void
  title: string
  defaultValues?: Investment
}) {
  const create = useCreateInvestment()
  const update = useUpdateInvestment()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues
      ? {
          name: defaultValues.name,
          type: defaultValues.type,
          goalAmount: defaultValues.goalAmount ? Number(defaultValues.goalAmount) : undefined,
          monthlyContribution: defaultValues.monthlyContribution
            ? Number(defaultValues.monthlyContribution)
            : undefined,
        }
      : { type: "cdi" },
  })

  // Projeção em tempo real conforme o usuário preenche meta e aporte mensal.
  // O valor atual é fixo (0 na criação; valor vigente na edição — só muda via aporte).
  const currentAmount = defaultValues ? Number(defaultValues.currentAmount) : 0
  const goalAmount = watch("goalAmount")
  const monthlyContribution = watch("monthlyContribution")
  const projection = computeProjection(currentAmount, goalAmount, monthlyContribution)

  const onSubmit = handleSubmit((values) => {
    const payload = {
      name: values.name,
      type: values.type,
      goalAmount: values.goalAmount ?? null,
      monthlyContribution: values.monthlyContribution ?? null,
    }
    const finish = () => {
      onClose()
      reset()
    }
    if (defaultValues) {
      update.mutate({ id: defaultValues.id, ...payload }, { onSuccess: finish })
    } else {
      create.mutate(payload, { onSuccess: finish })
    }
  })

  const isPending = create.isPending || update.isPending

  return (
    <FormModal
      open={open}
      onClose={() => {
        onClose()
        reset()
      }}
      title={title}
      formId="investment-form"
      onSubmit={onSubmit}
      isPending={isPending}
    >
      <div className="flex flex-col gap-4 py-1">
        {/* Nome */}
        <div className="flex flex-col gap-1.5">
          <Label>Nome</Label>
          <Input placeholder="Ex: CDB Nubank" autoFocus {...register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        {/* Tipo */}
        <div className="flex flex-col gap-1.5">
          <Label>Tipo</Label>
          <Select
            value={watch("type")}
            onValueChange={(v) => setValue("type", v as InvestmentType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INVESTMENT_TYPE_ORDER.map((type) => (
                <SelectItem key={type} value={type}>
                  {INVESTMENT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Meta e aporte mensal */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Meta (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Opcional"
              {...register("goalAmount", { valueAsNumber: true })}
            />
            {errors.goalAmount && (
              <p className="text-xs text-destructive">{errors.goalAmount.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Aporte mensal (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Opcional"
              {...register("monthlyContribution", { valueAsNumber: true })}
            />
            {errors.monthlyContribution && (
              <p className="text-xs text-destructive">{errors.monthlyContribution.message}</p>
            )}
          </div>
        </div>

        {/* Projeção em tempo real */}
        {projection && (
          <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
            <p className="text-xs font-medium text-muted-foreground">Projeção de prazo</p>
            {projection.goalReached ? (
              <p className="mt-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                {projection.estimatedLabel}
              </p>
            ) : projection.estimatedMonths == null ? (
              <p className="mt-0.5 text-muted-foreground">{projection.estimatedLabel}</p>
            ) : (
              <p className="mt-0.5">
                Faltam <strong>{formatCurrency(projection.remainingAmount)}</strong> · ~
                {projection.estimatedLabel}
              </p>
            )}
          </div>
        )}

        {defaultValues && (
          <p className="text-xs text-muted-foreground">
            Valor atual: <strong>{formatCurrency(currentAmount)}</strong> — alterado apenas via
            aportes.
          </p>
        )}
      </div>
    </FormModal>
  )
}

// ── Modal de registrar aporte ──────────────────────────────────────────────────
const contributionSchema = z.object({
  amount: z.number({ error: "Informe o valor" }).positive("Valor deve ser positivo"),
  date: z.string().min(1, "Informe a data"),
  notes: z.string().optional(),
})

type ContributionValues = z.infer<typeof contributionSchema>

function ContributionModal({
  investment,
  type,
  onClose,
}: {
  investment: Investment
  type: InvestmentMovementType
  onClose: () => void
}) {
  const create = useCreateContribution()
  const today = new Date().toISOString().split("T")[0]
  const isWithdrawal = type === "withdrawal"

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ContributionValues>({
    resolver: zodResolver(contributionSchema),
    defaultValues: { date: today },
  })

  const onSubmit = handleSubmit((values) => {
    create.mutate(
      {
        investmentId: investment.id,
        type,
        amount: values.amount,
        date: values.date,
        notes: values.notes || null,
      },
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
      open
      onClose={() => {
        onClose()
        reset()
      }}
      title={`${isWithdrawal ? "Registrar retirada" : "Registrar aporte"} — ${investment.name}`}
      formId="contribution-form"
      onSubmit={onSubmit}
      isPending={create.isPending}
      submitLabel="Registrar"
      pendingLabel="Registrando..."
    >
      <div className="flex flex-col gap-4 py-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{isWithdrawal ? "Valor da retirada (R$)" : "Valor do aporte (R$)"}</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0,00"
              autoFocus
              {...register("amount", { valueAsNumber: true })}
            />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Data</Label>
            <Input type="date" {...register("date")} />
            {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {isWithdrawal ? "O valor será subtraído do total" : "O valor será somado ao total"}. Valor
          atual: <strong>{formatCurrency(investment.currentAmount)}</strong>.
        </p>

        <div className="flex flex-col gap-1.5">
          <Label>Observação (opcional)</Label>
          <textarea
            rows={2}
            placeholder={isWithdrawal ? "Ex: Resgate parcial" : "Ex: Aporte de junho"}
            className="w-full resize-none rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            {...register("notes")}
          />
        </div>
      </div>
    </FormModal>
  )
}

// ── Modal de histórico de aportes ───────────────────────────────────────────────
function HistoryModal({
  investment,
  onClose,
}: {
  investment: Investment
  onClose: () => void
}) {
  const { data: contributions, isLoading } = useContributions(investment.id)
  const deleteMutation = useDeleteContribution()

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico de movimentos</DialogTitle>
          <DialogDescription>{investment.name}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col gap-1 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : !contributions?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum movimento registrado ainda.
          </p>
        ) : (
          <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border">
            {contributions.map((contribution) => {
              const isWithdrawal = contribution.type === "withdrawal"
              return (
                <div
                  key={contribution.id}
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-medium tabular-nums",
                        isWithdrawal
                          ? "text-destructive"
                          : "text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      {isWithdrawal ? "−" : "+"}
                      {formatCurrency(contribution.amount)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {isWithdrawal ? "Retirada" : "Aporte"} · {formatDate(contribution.date)}
                      {contribution.notes ? ` · ${contribution.notes}` : ""}
                    </p>
                  </div>
                  <IconButton
                    label="Remover movimento"
                    variant="destructive"
                    onClick={() =>
                      deleteMutation.mutate({
                        investmentId: investment.id,
                        contributionId: contribution.id,
                      })
                    }
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

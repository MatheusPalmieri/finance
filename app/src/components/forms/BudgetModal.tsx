import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v4"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FormModal } from "@/components/forms/FormModal"
import { useCreateBudget, useUpdateBudget } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { FINANCE } from "@/lib/tokens"
import {
  BUDGET_TYPE_LABELS,
  BUDGET_TYPE_TARGET,
  type Budget,
  type BudgetType,
} from "@/types/finance"

// ── Schema ────────────────────────────────────────────────────────────────────
const schema = z
  .object({
    name: z.string().min(1, "Informe o nome"),
    type: z.enum(["essential", "desire", "investment"]),
    amountType: z.enum(["fixed", "variable"]),
    amount: z.number().positive("Valor deve ser positivo").optional(),
    amountMin: z.number().positive("Valor deve ser positivo").optional(),
    amountMax: z.number().positive("Valor deve ser positivo").optional(),
  })
  .superRefine((val, ctx) => {
    if (val.amountType === "fixed") {
      if (val.amount == null)
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          message: "Informe o valor",
        })
    } else {
      if (val.amountMin == null)
        ctx.addIssue({
          code: "custom",
          path: ["amountMin"],
          message: "Informe o mínimo",
        })
      if (val.amountMax == null)
        ctx.addIssue({
          code: "custom",
          path: ["amountMax"],
          message: "Informe o máximo",
        })
      if (
        val.amountMin != null &&
        val.amountMax != null &&
        val.amountMin >= val.amountMax
      )
        ctx.addIssue({
          code: "custom",
          path: ["amountMax"],
          message: "Máximo deve ser maior que o mínimo",
        })
    }
  })

export type BudgetFormValues = z.infer<typeof schema>

const TYPE_ORDER: BudgetType[] = ["essential", "desire", "investment"]

// ── Modal de criar/editar ─────────────────────────────────────────────────────
// Com `defaultValues` edita o orçamento; sem ele cria um novo, opcionalmente
// pré-preenchido com `initialValues` (ex.: converter uma transação em orçamento)
export function BudgetModal({
  open,
  onClose,
  title,
  defaultValues,
  initialValues,
  submitLabel,
}: {
  open: boolean
  onClose: () => void
  title: string
  defaultValues?: Budget
  initialValues?: Partial<BudgetFormValues>
  submitLabel?: string
}) {
  const create = useCreateBudget()
  const update = useUpdateBudget()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues
      ? {
          name: defaultValues.name,
          type: defaultValues.type,
          amountType: defaultValues.amountType,
          amount: defaultValues.amount
            ? Number(defaultValues.amount)
            : undefined,
          amountMin: defaultValues.amountMin
            ? Number(defaultValues.amountMin)
            : undefined,
          amountMax: defaultValues.amountMax
            ? Number(defaultValues.amountMax)
            : undefined,
        }
      : { type: "essential", amountType: "fixed", ...initialValues },
  })

  const amountType = watch("amountType")

  const onSubmit = handleSubmit((values) => {
    const payload =
      values.amountType === "fixed"
        ? {
            name: values.name,
            type: values.type,
            amountType: "fixed" as const,
            amount: values.amount,
          }
        : {
            name: values.name,
            type: values.type,
            amountType: "variable" as const,
            amountMin: values.amountMin,
            amountMax: values.amountMax,
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
      formId="budget-form"
      onSubmit={onSubmit}
      isPending={isPending}
      submitLabel={submitLabel}
    >
      <div className="flex flex-col gap-4 py-1">
        {/* Nome */}
        <div className="flex flex-col gap-1.5">
          <Label>Nome</Label>
          <Input placeholder="Ex: Aluguel" autoFocus {...register("name")} />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        {/* Tipo (50/30/20) */}
        <div className="flex flex-col gap-1.5">
          <Label>Tipo</Label>
          <Select
            value={watch("type")}
            onValueChange={(v) => setValue("type", v as BudgetType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_ORDER.map((type) => (
                <SelectItem key={type} value={type}>
                  {BUDGET_TYPE_LABELS[type]} ({BUDGET_TYPE_TARGET[type]}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Forma do valor */}
        <div className="flex flex-col gap-1.5">
          <Label>Forma do valor</Label>
          <div className="flex gap-2">
            <SegButton
              active={amountType === "fixed"}
              onClick={() => setValue("amountType", "fixed")}
              color={FINANCE.fixed}
            >
              Fixo
            </SegButton>
            <SegButton
              active={amountType === "variable"}
              onClick={() => setValue("amountType", "variable")}
              color={FINANCE.variable}
            >
              Variável (faixa)
            </SegButton>
          </div>
        </div>

        {/* Valor(es) conforme a forma */}
        {amountType === "fixed" ? (
          <div className="flex flex-col gap-1.5">
            <Label>Valor (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0,00"
              {...register("amount", { valueAsNumber: true })}
            />
            {errors.amount && (
              <p className="text-xs text-destructive">
                {errors.amount.message}
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Mínimo (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                {...register("amountMin", { valueAsNumber: true })}
              />
              {errors.amountMin && (
                <p className="text-xs text-destructive">
                  {errors.amountMin.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Máximo (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                {...register("amountMax", { valueAsNumber: true })}
              />
              {errors.amountMax && (
                <p className="text-xs text-destructive">
                  {errors.amountMax.message}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </FormModal>
  )
}

// Botão segmentado para escolhas binárias
function SegButton({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean
  onClick: () => void
  color: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center rounded-lg border py-2 text-xs font-medium transition-colors",
        active
          ? "border-transparent text-white"
          : "text-muted-foreground hover:text-foreground"
      )}
      style={active ? { backgroundColor: color } : {}}
    >
      {children}
    </button>
  )
}

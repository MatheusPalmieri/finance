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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { FormModal } from "@/components/forms/FormModal"
import { useSaveCategoryPlan } from "@/lib/queries"
import {
  SPENDING_GROUP_LABELS,
  SPENDING_GROUP_ORDER,
  SPENDING_GROUP_TARGET,
  type Budget,
  type Category,
  type SpendingGroup,
} from "@/types/finance"

// ── Schema ────────────────────────────────────────────────────────────────────
// "none" = a categoria fica sem orçamento; só o grupo 50/30/20 é gravado
const schema = z
  .object({
    categoryId: z.string().min(1, "Selecione a categoria"),
    group: z.enum(["essential", "variable", "investment"]),
    amountType: z.enum(["exact", "range", "none"]),
    amount: z.number().positive("Valor deve ser positivo").optional(),
    amountMin: z.number().min(0, "Valor não pode ser negativo").optional(),
    amountMax: z.number().positive("Valor deve ser positivo").optional(),
  })
  .superRefine((val, ctx) => {
    if (val.amountType === "exact" && val.amount == null) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Informe o valor",
      })
    }
    if (val.amountType !== "range") return
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
  })

type FormValues = z.infer<typeof schema>

const AMOUNT_TYPES: { value: FormValues["amountType"]; label: string }[] = [
  { value: "exact", label: "Valor exato" },
  { value: "range", label: "Faixa" },
  { value: "none", label: "Sem orçamento" },
]

// `NaN` do input vazio vira `undefined` para o zod tratar como ausente
const asNumber = {
  setValueAs: (v: string) => (v === "" ? undefined : Number(v)),
}

// ── Modal do plano da categoria ───────────────────────────────────────────────
// Com `category`, edita o plano dela; sem, o usuário escolhe entre `choices`
// (categorias que ainda não têm orçamento)
export function BudgetModal({
  open,
  onClose,
  title,
  category,
  budget,
  choices,
}: {
  open: boolean
  onClose: () => void
  title: string
  category?: Category
  budget?: Budget | null
  choices?: Category[]
}) {
  const save = useSaveCategoryPlan()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      categoryId: category?.id ?? "",
      group: category?.group ?? "variable",
      amountType: budget?.amountType ?? (category ? "none" : "exact"),
      amount: budget?.amount ? Number(budget.amount) : undefined,
      amountMin: budget?.amountMin ? Number(budget.amountMin) : undefined,
      amountMax: budget?.amountMax ? Number(budget.amountMax) : undefined,
    },
  })

  const amountType = watch("amountType")
  const group = watch("group")

  function close() {
    onClose()
    reset()
  }

  const onSubmit = handleSubmit((values) => {
    save.mutate(
      {
        categoryId: values.categoryId,
        group: values.group,
        amountType: values.amountType === "none" ? null : values.amountType,
        amount: values.amountType === "exact" ? values.amount : null,
        amountMin: values.amountType === "range" ? values.amountMin : null,
        amountMax: values.amountType === "range" ? values.amountMax : null,
      },
      { onSuccess: close }
    )
  })

  return (
    <FormModal
      open={open}
      onClose={close}
      title={title}
      formId="budget-form"
      onSubmit={onSubmit}
      isPending={save.isPending}
    >
      <div className="flex flex-col gap-4 py-1">
        {/* Categoria: fixa ao editar, escolhida ao criar */}
        {category ? (
          <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2.5 text-sm font-medium">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            {category.name}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label>Categoria</Label>
            <Select
              value={watch("categoryId")}
              onValueChange={(id) => {
                setValue("categoryId", id, { shouldValidate: true })
                // Começa pelo grupo que a categoria já tem
                const chosen = choices?.find((c) => c.id === id)
                if (chosen) setValue("group", chosen.group)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                {choices?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.categoryId && (
              <p className="text-xs text-destructive">
                {errors.categoryId.message}
              </p>
            )}
          </div>
        )}

        {/* Grupo 50/30/20 — vale para todo gasto da categoria */}
        <div className="flex flex-col gap-1.5">
          <Label id="plan-group-label">Grupo</Label>
          <ToggleGroup
            aria-labelledby="plan-group-label"
            type="single"
            variant="outline"
            spacing={0}
            className="w-full"
            value={group}
            // Radix permite desmarcar o item ativo; ignora para sempre haver um valor
            onValueChange={(v) => v && setValue("group", v as SpendingGroup)}
          >
            {SPENDING_GROUP_ORDER.map((g) => (
              <ToggleGroupItem
                key={g}
                value={g}
                size="sm"
                className="flex-1 text-xs"
              >
                {SPENDING_GROUP_LABELS[g]} ({SPENDING_GROUP_TARGET[g]}%)
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            Todo gasto desta categoria conta neste grupo da regra 50/30/20.
          </p>
        </div>

        {/* Forma do valor */}
        <div className="flex flex-col gap-1.5">
          <Label id="plan-amount-type-label">Orçamento mensal</Label>
          <ToggleGroup
            aria-labelledby="plan-amount-type-label"
            type="single"
            variant="outline"
            spacing={0}
            className="w-full"
            value={amountType}
            onValueChange={(v) =>
              v && setValue("amountType", v as FormValues["amountType"])
            }
          >
            {AMOUNT_TYPES.map(({ value, label }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                size="sm"
                className="flex-1 text-xs"
              >
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Valor(es) conforme a forma */}
        {amountType === "exact" && (
          <div className="flex flex-col gap-1.5">
            <Label>Valor (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0,00"
              {...register("amount", asNumber)}
            />
            {errors.amount && (
              <p className="text-xs text-destructive">
                {errors.amount.message}
              </p>
            )}
          </div>
        )}
        {amountType === "range" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Mínimo (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                {...register("amountMin", asNumber)}
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
                {...register("amountMax", asNumber)}
              />
              {errors.amountMax && (
                <p className="text-xs text-destructive">
                  {errors.amountMax.message}
                </p>
              )}
            </div>
          </div>
        )}
        {amountType === "none" && (
          <p className="rounded-xl border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            A categoria continua contando no grupo escolhido, mas sem meta de
            valor. Na projeção, ela segue o histórico de gastos.
          </p>
        )}
      </div>
    </FormModal>
  )
}

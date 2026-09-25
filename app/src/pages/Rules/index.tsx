import { useEffect, useMemo, useState } from "react"
import {
  CalendarClock,
  History,
  ListFilter,
  Pencil,
  Plus,
  Power,
  Repeat,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { BudgetCombobox } from "@/components/forms/BudgetCombobox"
import { FormModal } from "@/components/forms/FormModal"
import { ErrorState } from "@/components/ui/error-state"
import { SegmentedControl } from "@/components/charts"
import {
  useApplyRule,
  useCategories,
  useCreateRule,
  useDeleteRule,
  useDismissRecurring,
  useRecalculateRecurring,
  useRecurring,
  useRuleApplyPreview,
  useRules,
  useTestRule,
  useToggleRule,
  useUpdateRule,
} from "@/lib/queries"
import { formatCurrency, formatDate, relativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { FINANCE, tint } from "@/lib/tokens"
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_ORDER,
  RECURRING_INTERVAL_LABELS,
  RECURRING_STATUS_LABELS,
  RULE_MATCH_LABELS,
  RULE_SOURCE_LABELS,
  type ClassificationRule,
  type RuleApplyField,
  type PaymentMethod,
  type RecurringSeries,
  type RecurringStatus,
  type Recurrence,
  type RuleMatchType,
  type RuleSource,
} from "@/types/finance"

type Tab = "rules" | "recurring"

export function Rules() {
  const [tab, setTab] = useState<Tab>("rules")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Classificação
          </h1>
          <p className="text-sm text-muted-foreground">
            Regras que categorizam o extrato e as cobranças que se repetem
          </p>
        </div>
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "rules", label: "Regras", icon: ListFilter },
            { value: "recurring", label: "Recorrentes", icon: Repeat },
          ]}
        />
      </div>

      {tab === "rules" ? <RulesTab /> : <RecurringTab />}
    </div>
  )
}

// ── Aba de regras ─────────────────────────────────────────────────────────────
function RulesTab() {
  const [search, setSearch] = useState("")
  const [source, setSource] = useState<RuleSource | "">("")
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ClassificationRule | null>(null)
  const [deleting, setDeleting] = useState<ClassificationRule | null>(null)
  const [applying, setApplying] = useState<ClassificationRule | null>(null)

  const params = useMemo(
    () => ({ search: search || undefined, source: source || undefined }),
    [search, source]
  )
  const { data: rules, isLoading, isError, refetch } = useRules(params)
  const toggle = useToggleRule()
  const remove = useDeleteRule()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search
            size={14}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Buscar por padrão ou nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={source || "all"}
          onValueChange={(v) => setSource(v === "all" ? "" : (v as RuleSource))}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as origens</SelectItem>
            <SelectItem value="seed">Padrão</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="learned">Aprendida</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="gap-2" onClick={() => setCreating(true)}>
          <Plus size={15} />
          Nova regra
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          message="Não foi possível carregar as regras."
          onRetry={() => refetch()}
        />
      ) : !rules?.length ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <ListFilter size={40} className="text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {search || source
              ? "Nenhuma regra encontrada"
              : "Nenhuma regra cadastrada"}
          </p>
          {!search && !source && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreating(true)}
            >
              Criar primeira regra
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-[1fr_140px_120px_100px_124px] gap-3 border-b bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>Padrão</span>
            <span>Aplica</span>
            <span>Origem</span>
            <span className="text-right">Usos</span>
            <span />
          </div>
          <div className="divide-y">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onToggle={() => toggle.mutate(rule.id)}
                onApply={() => setApplying(rule)}
                onEdit={() => setEditing(rule)}
                onDelete={() => setDeleting(rule)}
              />
            ))}
          </div>
        </div>
      )}

      {creating && (
        <RuleModal open onClose={() => setCreating(false)} title="Nova regra" />
      )}
      {editing && (
        <RuleModal
          open
          onClose={() => setEditing(null)}
          title="Editar regra"
          rule={editing}
        />
      )}

      {applying && (
        <ApplyRuleDialog rule={applying} onClose={() => setApplying(null)} />
      )}

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra?</AlertDialogTitle>
            <AlertDialogDescription>
              A regra <strong>{deleting?.pattern}</strong> será removida
              permanentemente. As transações já classificadas por ela não mudam.
              Para desligar sem apagar, use o botão de ativar/desativar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleting)
                  remove.mutate(deleting.id, {
                    onSuccess: () => setDeleting(null),
                  })
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

const APPLY_FIELD_LABELS: Record<RuleApplyField, string> = {
  name: "nome",
  category: "categoria",
  essential: "tipo de gasto",
  recurrence: "recorrência",
  budget: "orçamento",
}

// Regras só valem para o que o sync traz de novo. Aqui o usuário reaplica
// uma regra no histórico — sempre vendo antes o que vai mudar.
function ApplyRuleDialog({
  rule,
  onClose,
}: {
  rule: ClassificationRule
  onClose: () => void
}) {
  const { data: preview, isLoading, isError } = useRuleApplyPreview(rule.id)
  const apply = useApplyRule()
  const total = preview?.total ?? 0
  const items = preview?.data ?? []

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Aplicar às transações existentes</AlertDialogTitle>
          <AlertDialogDescription>
            A regra <strong className="font-mono">{rule.pattern}</strong> vale
            para as transações novas do sync. Aplicar agora corrige também as
            que já estão no banco. Só muda a classificação: valor, data, conta e
            forma de pagamento continuam vindo do Open Finance.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">
            Não foi possível calcular a prévia.
          </p>
        ) : total === 0 ? (
          <p className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
            Nenhuma transação existente precisa mudar.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              {total} {total === 1 ? "transação vai" : "transações vão"} mudar
            </p>
            <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border">
              {items.map((item) => (
                <li key={item.id} className="flex flex-col gap-0.5 px-3 py-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {item.name}
                      {item.nextName !== item.name && (
                        <span className="text-muted-foreground">
                          {" "}
                          → {item.nextName}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums">
                      {formatCurrency(Math.abs(Number(item.amount)))}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(item.date)} · muda{" "}
                    {item.fields.map((f) => APPLY_FIELD_LABELS[f]).join(", ")}
                  </p>
                </li>
              ))}
              {total > items.length && (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  e mais {total - items.length}
                </li>
              )}
            </ul>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={total === 0 || apply.isPending}
            onClick={(e) => {
              // Fecha só quando terminar, para o usuário ver o resultado
              e.preventDefault()
              apply.mutate(rule.id, { onSuccess: onClose })
            }}
          >
            {apply.isPending ? "Aplicando..." : `Aplicar a ${total}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Resumo legível do que a regra preenche — evita uma tabela de 8 colunas. */
function ruleEffects(rule: ClassificationRule): string[] {
  const out: string[] = []
  if (rule.renameTo) out.push(`renomeia para "${rule.renameTo}"`)
  if (rule.category) out.push(rule.category.name)
  if (rule.paymentMethod) out.push(PAYMENT_METHOD_LABELS[rule.paymentMethod])
  if (rule.recurrence)
    out.push(rule.recurrence === "fixed" ? "gasto recorrente" : "gasto avulso")
  if (rule.isEssential !== null)
    out.push(rule.isEssential ? "essencial" : "não essencial")
  if (rule.forceIncome) out.push("força entrada")
  if (rule.budget) out.push(`orçamento ${rule.budget.name}`)
  return out
}

function RuleRow({
  rule,
  onToggle,
  onApply,
  onEdit,
  onDelete,
}: {
  rule: ClassificationRule
  onToggle: () => void
  onApply: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const effects = ruleEffects(rule)

  return (
    <div
      className={cn(
        "group grid grid-cols-[1fr_140px_120px_100px_124px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40",
        !rule.enabled && "opacity-50"
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-mono text-xs">{rule.pattern}</p>
        <p className="truncate text-xs text-muted-foreground">
          {effects.length > 0 ? effects.join(" · ") : "não preenche nada"}
        </p>
      </div>

      <span className="text-xs text-muted-foreground">
        {RULE_MATCH_LABELS[rule.matchType]} · prio {rule.priority}
      </span>

      <span
        className="w-fit rounded-md px-1.5 py-0.5 text-[10px] font-medium"
        style={{
          backgroundColor: tint(
            rule.source === "learned" ? FINANCE.income : FINANCE.neutral,
            14
          ),
          color: rule.source === "learned" ? FINANCE.income : undefined,
        }}
      >
        {RULE_SOURCE_LABELS[rule.source]}
      </span>

      <span
        className="text-right text-xs text-muted-foreground tabular-nums"
        title={
          rule.lastHitAt
            ? `Última vez ${relativeTime(rule.lastHitAt)}`
            : undefined
        }
      >
        {rule.hitCount > 0 ? `${rule.hitCount}x` : "—"}
      </span>

      <div className="flex items-center justify-end gap-1 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
        <button
          type="button"
          onClick={onToggle}
          aria-label={rule.enabled ? "Desativar regra" : "Ativar regra"}
          title={rule.enabled ? "Desativar regra" : "Ativar regra"}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-7"
        >
          <Power size={14} />
        </button>
        <button
          type="button"
          onClick={onApply}
          aria-label={`Aplicar ${rule.pattern} às transações existentes`}
          title="Aplicar às existentes"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-7"
        >
          <History size={14} />
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar ${rule.pattern}`}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-7"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Excluir ${rule.pattern}`}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive lg:size-7"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Modal de criar/editar regra, com preview ao vivo ──────────────────────────
const NONE = "__none__"

function RuleModal({
  open,
  onClose,
  title,
  rule,
}: {
  open: boolean
  onClose: () => void
  title: string
  rule?: ClassificationRule
}) {
  const { data: categories } = useCategories()
  const create = useCreateRule()
  const update = useUpdateRule()
  const test = useTestRule()

  const [pattern, setPattern] = useState(rule?.pattern ?? "")
  const [matchType, setMatchType] = useState<RuleMatchType>(
    rule?.matchType ?? "contains"
  )
  const [priority, setPriority] = useState(rule?.priority ?? 500)
  const [renameTo, setRenameTo] = useState(rule?.renameTo ?? "")
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? "")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">(
    rule?.paymentMethod ?? ""
  )
  const [recurrence, setRecurrence] = useState<Recurrence | "">(
    rule?.recurrence ?? ""
  )
  const [budgetId, setBudgetId] = useState(rule?.budgetId ?? "")

  // Preview ao vivo com debounce de 400ms — mostra o que a regra casaria hoje
  const { mutate: runTest, data: preview, reset: resetTest } = test
  useEffect(() => {
    if (!pattern.trim()) {
      resetTest()
      return
    }
    const timer = setTimeout(() => runTest({ pattern, matchType }), 400)
    return () => clearTimeout(timer)
  }, [pattern, matchType, runTest, resetTest])

  const isPending = create.isPending || update.isPending

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const payload = {
      pattern: pattern.trim(),
      matchType,
      priority,
      renameTo: renameTo.trim() || null,
      categoryId: categoryId || null,
      paymentMethod: paymentMethod || null,
      recurrence: recurrence || null,
      // Orçamento só faz sentido em gasto fixo, como na transação
      budgetId: recurrence === "fixed" ? budgetId || null : null,
    }
    if (rule) {
      update.mutate(
        // Promover uma regra aprendida a manual é só mudar a origem
        { id: rule.id, ...payload, source: rule.source },
        { onSuccess: onClose }
      )
    } else {
      create.mutate({ ...payload, source: "manual" }, { onSuccess: onClose })
    }
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={title}
      formId="rule-form"
      onSubmit={onSubmit}
      isPending={isPending}
    >
      <div className="flex flex-col gap-4 py-1">
        <div className="flex flex-col gap-1.5">
          <Label>Padrão</Label>
          <Input
            autoFocus
            placeholder="ex: conceito imobiliaria"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Comparado contra a descrição sem acento e em minúsculas.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Tipo de match</Label>
            <Select
              value={matchType}
              onValueChange={(v) => setMatchType(v as RuleMatchType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RULE_MATCH_LABELS) as RuleMatchType[]).map(
                  (m) => (
                    <SelectItem key={m} value={m}>
                      {RULE_MATCH_LABELS[m]}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Prioridade</Label>
            <Input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="tabular-nums"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Renomear para (opcional)</Label>
          <Input
            placeholder="ex: Aluguel"
            value={renameTo}
            onChange={(e) => setRenameTo(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Categoria</Label>
            <Select
              value={categoryId || NONE}
              onValueChange={(v) => setCategoryId(v === NONE ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não definir</SelectItem>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Forma de pagamento</Label>
            <Select
              value={paymentMethod || NONE}
              onValueChange={(v) =>
                setPaymentMethod(v === NONE ? "" : (v as PaymentMethod))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não definir</SelectItem>
                {PAYMENT_METHOD_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PAYMENT_METHOD_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Recorrência</Label>
          <Select
            value={recurrence || NONE}
            onValueChange={(v) => {
              setRecurrence(v === NONE ? "" : (v as Recurrence))
              if (v !== "fixed") setBudgetId("")
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Não definir</SelectItem>
              <SelectItem value="fixed">Recorrente</SelectItem>
              <SelectItem value="variable">Avulso</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {recurrence === "fixed" && (
          <div className="flex flex-col gap-1.5">
            <Label>Orçamento vinculado</Label>
            <BudgetCombobox
              value={budgetId || undefined}
              onChange={(id) => setBudgetId(id ?? "")}
              selectedName={rule?.budget?.name}
            />
            <p className="text-xs text-muted-foreground">
              Sem orçamento, a transação entra como avulsa.
            </p>
          </div>
        )}

        {/* Preview ao vivo */}
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium">
            {preview
              ? `${preview.total} transaç${preview.total === 1 ? "ão casaria" : "ões casariam"}`
              : "Digite um padrão para ver o que ele casaria"}
          </p>
          {preview && preview.matches.length > 0 && (
            <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto text-xs text-muted-foreground">
              {preview.matches.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span className="shrink-0 tabular-nums">
                    {formatDate(m.date)}
                  </span>
                  <span className="truncate">{m.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums">
                    {formatCurrency(m.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </FormModal>
  )
}

// ── Aba de recorrentes ────────────────────────────────────────────────────────
const STATUS_ORDER: RecurringStatus[] = ["ACTIVE", "OVERDUE", "CANCELLED"]

const STATUS_HEX: Record<RecurringStatus, string> = {
  ACTIVE: FINANCE.income,
  OVERDUE: FINANCE.essential,
  CANCELLED: FINANCE.neutral,
}

function RecurringTab() {
  const { data, isLoading, isError, refetch } = useRecurring()
  const recalculate = useRecalculateRecurring()
  const dismiss = useDismissRecurring()

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    items: data?.data.filter((s) => s.status === status) ?? [],
  }))

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <ErrorState
        message="Não foi possível carregar as cobranças recorrentes."
        onRetry={() => refetch()}
      />
    )
  }

  const total = data?.data.length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4">
        <div>
          <p className="text-2xl font-bold tabular-nums">
            {formatCurrency(data?.totalMonthly ?? 0)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              /mês
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            em {grouped[0].items.length} cobrança
            {grouped[0].items.length === 1 ? " ativa" : "s ativas"} — valores
            semanais e anuais já normalizados para o mês
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => recalculate.mutate()}
          disabled={recalculate.isPending}
        >
          <Repeat size={14} />
          {recalculate.isPending ? "Recalculando..." : "Recalcular"}
        </Button>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <CalendarClock size={40} className="text-muted-foreground/40" />
          <p className="text-muted-foreground">
            Nenhuma cobrança recorrente detectada nesta carteira
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            São necessárias pelo menos 3 cobranças do mesmo estabelecimento, em
            intervalos regulares e com valores parecidos.
          </p>
        </div>
      ) : (
        grouped.map(({ status, items }) =>
          items.length === 0 ? null : (
            <div key={status} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_HEX[status] }}
                />
                <h2 className="text-sm font-semibold">
                  {RECURRING_STATUS_LABELS[status]}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((serie) => (
                  <RecurringCard
                    key={serie.id}
                    serie={serie}
                    onDismiss={() => dismiss.mutate(serie.id)}
                  />
                ))}
              </div>
            </div>
          )
        )
      )}
    </div>
  )
}

function RecurringCard({
  serie,
  onDismiss,
}: {
  serie: RecurringSeries
  onDismiss: () => void
}) {
  const color = STATUS_HEX[serie.status]

  return (
    <div className="group relative flex flex-col gap-2 overflow-hidden rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: color }}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium" title={serie.label}>
            {serie.label}
          </p>
          <p className="text-xs text-muted-foreground">
            {serie.category?.name ?? "Sem categoria"} ·{" "}
            {RECURRING_INTERVAL_LABELS[serie.intervalDays] ??
              `a cada ${serie.intervalDays}d`}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          title="Não é uma cobrança recorrente"
          aria-label={`Dispensar ${serie.label}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 lg:size-7 lg:opacity-0 lg:group-hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex items-end gap-2">
        <p className="text-lg font-bold tabular-nums">
          {formatCurrency(serie.monthlyCostBrl)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            /mês
          </span>
        </p>
        {serie.priceChangePct !== null && (
          <span
            className="mb-1 flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-destructive"
            style={{ backgroundColor: tint(FINANCE.expense, 14) }}
            title={
              serie.priceChangeSince
                ? `Desde ${formatDate(serie.priceChangeSince)}`
                : undefined
            }
          >
            <TrendingUp size={10} />+{serie.priceChangePct}%
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {serie.occurrences} cobranças · última em{" "}
        {formatDate(serie.lastChargeDate)}
        {serie.status === "ACTIVE" && (
          <> · próxima prevista {formatDate(serie.expectedNextDate)}</>
        )}
      </p>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpNarrowWide,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useAccounts,
  useBulkCreateTransactions,
  useCategories,
  useClassificationFeedback,
  useClassificationSuggest,
  useDefaultAccount,
  useDeleteRule,
} from "@/lib/queries"
import type { TransactionInput } from "@/lib/api"
import { formatCurrency, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { FINANCE } from "@/lib/tokens"
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_ORDER,
  type Recurrence,
  type PaymentMethod,
  type SuggestionSource,
} from "@/types/finance"
import { CsvImportError, parseStatementCsv } from "./csv"

// `amount` é sempre a magnitude (positiva) e `isIncome` define o sinal —
// mesmo padrão do botão redondo em "Nova transação" (Transactions/index.tsx).
// Convenção interna do domínio: positivo = despesa, negativo = entrada.
// Conta vale para o lote inteiro (definida na etapa "Configurar"). Categoria
// e forma de pagamento são por linha — a forma de pagamento só nasce
// pré-preenchida com o valor escolhido em "Configurar", mas cada linha
// continua editável individualmente na revisão.
interface DraftRow {
  key: string
  date: string
  name: string
  /** Descrição crua do extrato — é o que vai no feedback, não o nome editado. */
  rawDescription: string
  amount: number
  isIncome: boolean
  identifier: string
  categoryId: string
  paymentMethod: PaymentMethod | ""
  recurrence: Recurrence
  /** Qual camada sugeriu esta linha (ver .claude/docs/domain/classification.md). */
  source: SuggestionSource
  confidence: number
}

type Step = "file" | "configure" | "review"

const STEPS: { key: Step; label: string }[] = [
  { key: "file", label: "Arquivo" },
  { key: "configure", label: "Configurar" },
  { key: "review", label: "Revisar" },
]

/** Abaixo disso, a sugestão da IA merece um destaque âmbar na revisão. */
const LOW_CONFIDENCE = 0.7

const GRID = "grid grid-cols-[110px_1fr_170px_1fr_1fr_86px_32px] gap-2"

export function ImportModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { data: accounts } = useAccounts()
  const { data: defaultAccount } = useDefaultAccount()
  const { data: categories } = useCategories()
  const bulkCreate = useBulkCreateTransactions()
  const suggest = useClassificationSuggest()
  const feedback = useClassificationFeedback()
  const deleteRule = useDeleteRule()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>("file")
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState("")
  const [parseError, setParseError] = useState("")
  const [rows, setRows] = useState<DraftRow[]>([])
  const [accountId, setAccountId] = useState("")
  const [aiAvailable, setAiAvailable] = useState(false)
  // Revisar primeiro o que importa: linhas sem sugestão e de baixa confiança
  const [sortByConfidence, setSortByConfidence] = useState(true)
  // Forma de pagamento "padrão" da etapa Configurar: só semeia cada linha ao
  // avançar pra revisão (goToReview) — o valor por linha é o que vai pro payload.
  // "Cartão de crédito" é o mais comum, já vem pré-selecionado.
  const [defaultPaymentMethod, setDefaultPaymentMethod] =
    useState<PaymentMethod>("credit_card")

  // Pré-seleciona a conta padrão assim que carregar — o usuário ainda pode trocar
  useEffect(() => {
    if (defaultAccount && !accountId) setAccountId(defaultAccount.id)
  }, [defaultAccount, accountId])

  function reset() {
    setStep("file")
    setFileName("")
    setParseError("")
    setRows([])
    setAccountId("")
    setAiAvailable(false)
    setSortByConfidence(true)
    setDefaultPaymentMethod("credit_card")
    suggest.reset()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleClose() {
    onClose()
    reset()
  }

  async function handleFile(file: File) {
    setFileName(file.name)
    setParseError("")
    try {
      const text = await file.text()
      const parsed = parseStatementCsv(text)

      const base: DraftRow[] = parsed.map((r, i) => ({
        key: r.identifier || `${r.date}-${i}`,
        date: r.date,
        name: r.name,
        rawDescription: r.name,
        amount: Math.abs(r.amount),
        isIncome: r.amount > 0,
        identifier: r.identifier,
        categoryId: "",
        paymentMethod: "",
        recurrence: "variable",
        source: "none",
        confidence: 0,
      }))
      setRows(base)
      setStep("configure")

      // Classificação server-side: regras → histórico → IA. Se falhar, as
      // linhas ficam sem categoria, exatamente como antes do motor existir.
      try {
        const result = await suggest.mutateAsync({
          items: parsed.map((r, i) => ({
            index: i,
            description: r.name,
            date: r.date,
            amount: r.amount,
          })),
        })
        setAiAvailable(result.aiAvailable)
        const byIndex = new Map(result.items.map((s) => [s.index, s]))
        setRows((prev) =>
          prev.map((row, i) => {
            const s = byIndex.get(i)
            if (!s) return row
            return {
              ...row,
              name: s.suggestedName ?? row.name,
              // `forceIncome` ignora o sinal do extrato (caso "Aplicação RDB")
              isIncome: s.forceIncome ?? row.isIncome,
              categoryId: s.categoryId ?? "",
              paymentMethod: s.paymentMethod ?? "",
              recurrence: s.recurrence ?? "variable",
              source: s.source,
              confidence: s.confidence,
            }
          })
        )
      } catch {
        setAiAvailable(false)
      }
    } catch (err) {
      setRows([])
      setParseError(
        err instanceof CsvImportError
          ? err.message
          : "Não foi possível ler o arquivo."
      )
    }
  }

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  /**
   * Trocar a categoria de uma linha ensina o motor: vira uma regra `learned`.
   * Roda em background e nunca bloqueia a revisão.
   */
  function handleCategoryChange(row: DraftRow, categoryId: string) {
    updateRow(row.key, { categoryId })
    if (!categoryId || categoryId === row.categoryId) return

    feedback.mutate(
      {
        description: row.rawDescription,
        categoryId,
        paymentMethod: row.paymentMethod || null,
        recurrence: row.recurrence,
        isEssential: !row.isIncome,
        renameTo: row.name !== row.rawDescription ? row.name : null,
      },
      {
        onSuccess: ({ created, ruleId }) => {
          if (!created) return
          toast.success(`Regra criada para "${row.name}"`, {
            duration: 5000,
            action: {
              label: "Desfazer",
              onClick: () => deleteRule.mutate(ruleId),
            },
          })
        },
        // Conflito com regra padrão/manual (409) ou qualquer outra falha não
        // pode atrapalhar a importação — a correção da linha já foi aplicada.
        onError: () => {},
      }
    )
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  // Semeia toda linha sem forma de pagamento com o padrão escolhido em
  // "Configurar" — cada linha continua editável individualmente depois
  function goToReview() {
    setRows((prev) =>
      prev.map((r) =>
        r.paymentMethod ? r : { ...r, paymentMethod: defaultPaymentMethod }
      )
    )
    setStep("review")
  }

  // Valor no sentido "extrato": entrada positiva, saída negativa (oposto do domínio interno)
  const signed = (r: DraftRow) => (r.isIncome ? r.amount : -r.amount)

  const netTotal = useMemo(
    () => rows.reduce((sum, r) => sum + signed(r), 0),
    [rows]
  )
  const dateSpan = useMemo(() => {
    if (rows.length === 0) return null
    const dates = rows.map((r) => r.date).sort()
    return { from: dates[0], to: dates[dates.length - 1] }
  }, [rows])

  const visibleRows = useMemo(() => {
    if (!sortByConfidence) return rows
    return [...rows].sort((a, b) => a.confidence - b.confidence)
  }, [rows, sortByConfidence])

  const stats = useMemo(() => {
    const counts: Record<SuggestionSource, number> = {
      rule: 0,
      knn: 0,
      llm: 0,
      none: 0,
    }
    for (const row of rows) counts[row.source]++
    return counts
  }, [rows])

  const canImport =
    accountId !== "" &&
    rows.length > 0 &&
    rows.every(
      (r) =>
        r.name.trim() &&
        r.date &&
        r.amount > 0 &&
        r.categoryId &&
        r.paymentMethod
    )

  function handleImport() {
    const payload: TransactionInput[] = rows.map((r) => ({
      name: r.name.trim(),
      amount: r.isIncome ? -r.amount : r.amount,
      categoryId: r.categoryId,
      // canImport já garantiu que não está vazio antes de chegar aqui
      paymentMethod: r.paymentMethod as PaymentMethod,
      accountId,
      // Essencial só faz sentido em saída — entrada nunca é essencial
      isEssential: !r.isIncome,
      recurrence: r.recurrence,
      budgetId: null,
      date: r.date,
      notes: r.identifier ? `Importado via CSV — ID ${r.identifier}` : null,
    }))
    bulkCreate.mutate(payload, { onSuccess: handleClose })
  }

  const isClassifying = suggest.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Importar transações (CSV)</DialogTitle>
        </DialogHeader>

        {/* Indicador de etapas */}
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {STEPS.map((s, i) => {
            const currentIndex = STEPS.findIndex((x) => x.key === step)
            const active = s.key === step
            const done = i < currentIndex
            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && <div className="h-px w-6 bg-border" />}
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
                    active && "bg-primary/10 text-primary",
                    done && "text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-full text-[10px]",
                      active ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}
                  >
                    {i + 1}
                  </span>
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-1">
          {/* ── Etapa 1: arquivo ─────────────────────────────────────────── */}
          {step === "file" && (
            <div className="flex flex-col gap-1.5">
              <Label>Arquivo do extrato</Label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) handleFile(file)
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-14 text-sm text-muted-foreground transition-colors hover:bg-input/50 hover:text-foreground",
                  dragOver
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-input/30"
                )}
              >
                <UploadCloud size={22} />
                <span>
                  {fileName || "Clique ou arraste o arquivo .csv aqui"}
                </span>
                <span className="text-xs">
                  Formato de extrato do Nubank — colunas Data, Valor, Descrição
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                }}
              />
              {parseError && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle size={13} />
                  {parseError}
                </p>
              )}
            </div>
          )}

          {/* ── Etapa 2: conta e forma de pagamento ──────────────────────── */}
          {step === "configure" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/40 px-4 py-3 text-sm">
                <span>
                  <strong>{rows.length}</strong> transaç
                  {rows.length === 1 ? "ão encontrada" : "ões encontradas"}
                  {dateSpan &&
                    ` · ${formatDate(dateSpan.from)} a ${formatDate(dateSpan.to)}`}
                </span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    netTotal >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                  )}
                >
                  Saldo do período: {formatCurrency(netTotal)}
                </span>
              </div>

              <ClassificationSummary
                isClassifying={isClassifying}
                stats={stats}
                aiAvailable={aiAvailable}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Conta de destino (todas as linhas)</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts?.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Forma de pagamento padrão</Label>
                  <Select
                    value={defaultPaymentMethod}
                    onValueChange={(v) =>
                      setDefaultPaymentMethod(v as PaymentMethod)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a forma de pagamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHOD_ORDER.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PAYMENT_METHOD_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Conta vale para o extrato inteiro. Forma de pagamento aqui é só
                o padrão pra preencher as linhas que a classificação não
                resolveu — dá pra trocar linha a linha na próxima etapa.
                Corrigir uma categoria na revisão cria uma regra, e o próximo
                extrato já acerta aquela linha sozinho.
              </p>
            </div>
          )}

          {/* ── Etapa 3: revisão ─────────────────────────────────────────── */}
          {step === "review" && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="min-h-0 flex-1 overflow-auto rounded-2xl border">
                <div
                  className={cn(
                    GRID,
                    "sticky top-0 z-10 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground"
                  )}
                >
                  <span>Data</span>
                  <span>Descrição</span>
                  <span>Valor (R$)</span>
                  <span>Categoria</span>
                  <span>Forma de pagamento</span>
                  <button
                    type="button"
                    onClick={() => setSortByConfidence((v) => !v)}
                    aria-pressed={sortByConfidence}
                    title={
                      sortByConfidence
                        ? "Ordenado por confiança — clique para voltar à ordem do extrato"
                        : "Ordem do extrato — clique para ordenar por confiança"
                    }
                    className={cn(
                      "flex items-center gap-1 rounded px-1 text-left transition-colors hover:text-foreground",
                      sortByConfidence && "text-primary"
                    )}
                  >
                    <ArrowUpNarrowWide size={12} />
                    Origem
                  </button>
                  <span />
                </div>

                <div className="divide-y">
                  {isClassifying
                    ? Array.from({ length: Math.min(rows.length || 6, 8) }).map(
                        (_, i) => (
                          <div key={i} className={cn(GRID, "px-3 py-2")}>
                            {Array.from({ length: 7 }).map((__, j) => (
                              <Skeleton key={j} className="h-8" />
                            ))}
                          </div>
                        )
                      )
                    : visibleRows.map((row) => {
                        const invalid =
                          !row.name.trim() ||
                          !row.categoryId ||
                          !row.paymentMethod
                        return (
                          <div
                            key={row.key}
                            className={cn(GRID, "items-center px-3 py-2")}
                          >
                            <Input
                              type="date"
                              value={row.date}
                              onChange={(e) =>
                                updateRow(row.key, { date: e.target.value })
                              }
                              className="h-8 text-xs"
                            />
                            <Input
                              value={row.name}
                              onChange={(e) =>
                                updateRow(row.key, { name: e.target.value })
                              }
                              title={row.rawDescription}
                              className={cn(
                                "h-8 text-xs",
                                invalid &&
                                  !row.name.trim() &&
                                  "border-destructive"
                              )}
                            />
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={row.amount}
                                onChange={(e) =>
                                  updateRow(row.key, {
                                    amount: Number(e.target.value),
                                  })
                                }
                                className="h-8 min-w-0 flex-1 text-xs tabular-nums"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateRow(row.key, {
                                    isIncome: !row.isIncome,
                                  })
                                }
                                aria-pressed={row.isIncome}
                                aria-label={
                                  row.isIncome
                                    ? "Entrada — clique para marcar como despesa"
                                    : "Despesa — clique para marcar como entrada"
                                }
                                title={
                                  row.isIncome
                                    ? "Entrada — clique para marcar como despesa"
                                    : "Despesa — clique para marcar como entrada"
                                }
                                className="flex size-7 shrink-0 items-center justify-center rounded-full text-white transition-colors"
                                style={{
                                  backgroundColor: row.isIncome
                                    ? FINANCE.income
                                    : FINANCE.expense,
                                }}
                              >
                                {row.isIncome ? (
                                  <Plus size={13} />
                                ) : (
                                  <Minus size={13} />
                                )}
                              </button>
                            </div>
                            <Select
                              value={row.categoryId || undefined}
                              onValueChange={(v) =>
                                handleCategoryChange(row, v)
                              }
                            >
                              <SelectTrigger
                                className={cn(
                                  "h-8 text-xs",
                                  invalid &&
                                    !row.categoryId &&
                                    "border-destructive"
                                )}
                              >
                                <SelectValue placeholder="Categoria" />
                              </SelectTrigger>
                              <SelectContent>
                                {categories?.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={row.paymentMethod || undefined}
                              onValueChange={(v) =>
                                updateRow(row.key, {
                                  paymentMethod: v as PaymentMethod,
                                })
                              }
                            >
                              <SelectTrigger
                                className={cn(
                                  "h-8 text-xs",
                                  invalid &&
                                    !row.paymentMethod &&
                                    "border-destructive"
                                )}
                              >
                                <SelectValue placeholder="Forma" />
                              </SelectTrigger>
                              <SelectContent>
                                {PAYMENT_METHOD_ORDER.map((p) => (
                                  <SelectItem key={p} value={p}>
                                    {PAYMENT_METHOD_LABELS[p]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <SourceBadge
                              source={row.source}
                              confidence={row.confidence}
                            />
                            <button
                              type="button"
                              onClick={() => removeRow(row.key)}
                              aria-label="Remover linha"
                              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )
                      })}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {rows.length} linha{rows.length === 1 ? "" : "s"} · saldo{" "}
                <span
                  className={
                    netTotal >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                  }
                >
                  {formatCurrency(netTotal)}
                </span>
                {" · "}
                {stats.rule} por regra, {stats.knn} pelo histórico, {stats.llm}{" "}
                por IA, {stats.none} sem sugestão
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <div>
            {step !== "file" && (
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() =>
                  setStep(step === "review" ? "configure" : "file")
                }
                disabled={bulkCreate.isPending}
              >
                <ArrowLeft size={14} />
                Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={bulkCreate.isPending}
            >
              Cancelar
            </Button>
            {step === "file" && rows.length > 0 && (
              <Button
                type="button"
                className="gap-2"
                onClick={() => setStep("configure")}
              >
                Próximo
                <ArrowRight size={14} />
              </Button>
            )}
            {step === "configure" && (
              <Button
                type="button"
                className="gap-2"
                onClick={goToReview}
                disabled={!accountId || isClassifying}
              >
                {isClassifying ? "Classificando..." : "Próximo: revisar"}
                <ArrowRight size={14} />
              </Button>
            )}
            {step === "review" && (
              <Button
                onClick={handleImport}
                disabled={!canImport || bulkCreate.isPending}
              >
                {bulkCreate.isPending
                  ? "Importando..."
                  : `Importar${rows.length ? ` (${rows.length})` : ""}`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Selo de origem da sugestão ───────────────────────────────────────────────
function SourceBadge({
  source,
  confidence,
}: {
  source: SuggestionSource
  confidence: number
}) {
  if (source === "none") {
    return (
      <span
        className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-center text-[10px] font-medium text-destructive"
        title="Nenhuma camada conseguiu classificar — preencha à mão"
      >
        revisar
      </span>
    )
  }

  if (source === "llm") {
    const low = confidence < LOW_CONFIDENCE
    return (
      <span
        className={cn(
          "flex items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
          low
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            : "bg-muted text-muted-foreground"
        )}
        title={`Sugerido por IA com ${Math.round(confidence * 100)}% de confiança`}
      >
        <Sparkles size={10} />
        {Math.round(confidence * 100)}%
      </span>
    )
  }

  return (
    <span
      className="rounded-md bg-muted px-1.5 py-0.5 text-center text-[10px] font-medium text-muted-foreground"
      title={
        source === "rule"
          ? "Aplicado por uma regra de classificação"
          : "Deduzido de transações parecidas já classificadas"
      }
    >
      {source === "rule" ? "regra" : "histórico"}
    </span>
  )
}

// ── Resumo da classificação na etapa Configurar ──────────────────────────────
function ClassificationSummary({
  isClassifying,
  stats,
  aiAvailable,
}: {
  isClassifying: boolean
  stats: Record<SuggestionSource, number>
  aiAvailable: boolean
}) {
  if (isClassifying) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
        <Sparkles size={14} className="animate-pulse" />
        Classificando as linhas...
      </div>
    )
  }

  const classified = stats.rule + stats.knn + stats.llm
  const total = classified + stats.none
  if (total === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border px-4 py-3 text-xs text-muted-foreground">
      <span className="text-sm font-medium text-foreground">
        {classified} de {total} classificadas
      </span>
      <span>{stats.rule} por regra</span>
      <span>{stats.knn} pelo histórico</span>
      <span>{stats.llm} por IA</span>
      {stats.none > 0 && (
        <span className="text-destructive">{stats.none} sem sugestão</span>
      )}
      {!aiAvailable && (
        <span className="ml-auto">IA indisponível — só regras e histórico</span>
      )}
    </div>
  )
}

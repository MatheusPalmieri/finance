import { useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, ArrowLeft, ArrowRight, Minus, Plus, Trash2, UploadCloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAccounts, useBulkCreateTransactions, useCategories, useDefaultAccount } from "@/lib/queries"
import type { TransactionInput } from "@/lib/api"
import { formatCurrency, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { FINANCE } from "@/lib/tokens"
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ORDER, type PaymentMethod } from "@/types/finance"
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
  amount: number
  isIncome: boolean
  identifier: string
  categoryId: string
  paymentMethod: PaymentMethod | ""
}

type Step = "file" | "configure" | "review"

const STEPS: { key: Step; label: string }[] = [
  { key: "file", label: "Arquivo" },
  { key: "configure", label: "Configurar" },
  { key: "review", label: "Revisar" },
]

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: accounts } = useAccounts()
  const { data: defaultAccount } = useDefaultAccount()
  const { data: categories } = useCategories()
  const bulkCreate = useBulkCreateTransactions()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>("file")
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState("")
  const [parseError, setParseError] = useState("")
  const [rows, setRows] = useState<DraftRow[]>([])
  const [accountId, setAccountId] = useState("")
  // Forma de pagamento "padrão" da etapa Configurar: só semeia cada linha ao
  // avançar pra revisão (goToReview) — o valor por linha é o que vai pro payload.
  // "Cartão de crédito" é o mais comum, já vem pré-selecionado.
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<PaymentMethod>("credit_card")

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
    setDefaultPaymentMethod("credit_card")
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
      setRows(
        parsed.map((r, i) => ({
          key: r.identifier || `${r.date}-${i}`,
          date: r.date,
          name: r.name,
          amount: Math.abs(r.amount),
          isIncome: r.amount > 0,
          identifier: r.identifier,
          categoryId: "",
          paymentMethod: "",
        }))
      )
      setStep("configure")
    } catch (err) {
      setRows([])
      setParseError(err instanceof CsvImportError ? err.message : "Não foi possível ler o arquivo.")
    }
  }

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  // Semeia toda linha sem forma de pagamento com o padrão escolhido em
  // "Configurar" — cada linha continua editável individualmente depois
  function goToReview() {
    setRows((prev) =>
      prev.map((r) => (r.paymentMethod ? r : { ...r, paymentMethod: defaultPaymentMethod }))
    )
    setStep("review")
  }

  // Valor no sentido "extrato": entrada positiva, saída negativa (oposto do domínio interno)
  const signed = (r: DraftRow) => (r.isIncome ? r.amount : -r.amount)

  const netTotal = useMemo(() => rows.reduce((sum, r) => sum + signed(r), 0), [rows])
  const dateSpan = useMemo(() => {
    if (rows.length === 0) return null
    const dates = rows.map((r) => r.date).sort()
    return { from: dates[0], to: dates[dates.length - 1] }
  }, [rows])
  const canImport =
    accountId !== "" &&
    rows.length > 0 &&
    rows.every((r) => r.name.trim() && r.date && r.amount > 0 && r.categoryId && r.paymentMethod)

  function handleImport() {
    const payload: TransactionInput[] = rows.map((r) => ({
      name: r.name.trim(),
      amount: r.isIncome ? -r.amount : r.amount,
      categoryId: r.categoryId,
      // canImport já garantiu que não está vazio antes de chegar aqui
      paymentMethod: r.paymentMethod as PaymentMethod,
      accountId,
      isEssential: true,
      recurrence: "variable",
      budgetId: null,
      date: r.date,
      notes: r.identifier ? `Importado via CSV — ID ${r.identifier}` : null,
    }))
    bulkCreate.mutate(payload, { onSuccess: handleClose })
  }

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
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) handleFile(file)
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-14 text-sm text-muted-foreground transition-colors hover:bg-input/50 hover:text-foreground",
                  dragOver ? "border-primary bg-primary/5 text-foreground" : "border-border bg-input/30"
                )}
              >
                <UploadCloud size={22} />
                <span>{fileName || "Clique ou arraste o arquivo .csv aqui"}</span>
                <span className="text-xs">Formato de extrato do Nubank — colunas Data, Valor, Descrição</span>
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
                  <strong>{rows.length}</strong> transaç{rows.length === 1 ? "ão encontrada" : "ões encontradas"}
                  {dateSpan && ` · ${formatDate(dateSpan.from)} a ${formatDate(dateSpan.to)}`}
                </span>
                <span className={cn("font-semibold tabular-nums", netTotal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                  Saldo do período: {formatCurrency(netTotal)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Conta de destino (todas as linhas)</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts?.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Forma de pagamento padrão</Label>
                  <Select
                    value={defaultPaymentMethod}
                    onValueChange={(v) => setDefaultPaymentMethod(v as PaymentMethod)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a forma de pagamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHOD_ORDER.map((p) => (
                        <SelectItem key={p} value={p}>{PAYMENT_METHOD_LABELS[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Conta vale para o extrato inteiro. Forma de pagamento aqui é só o padrão pra preencher
                todas as linhas — dá pra trocar linha a linha na próxima etapa. Categoria também é definida
                linha a linha na revisão. Toda linha importada entra como recorrência variável e gasto
                essencial; ajuste isso depois pela edição normal, se precisar.
              </p>
            </div>
          )}

          {/* ── Etapa 3: revisão ─────────────────────────────────────────── */}
          {step === "review" && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="min-h-0 flex-1 overflow-auto rounded-2xl border">
                <div className="grid grid-cols-[120px_1fr_190px_1fr_1fr_32px] gap-2 sticky top-0 z-10 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Data</span>
                  <span>Descrição</span>
                  <span>Valor (R$)</span>
                  <span>Categoria</span>
                  <span>Forma de pagamento</span>
                  <span />
                </div>

                <div className="divide-y">
                  {rows.map((row) => {
                    const invalid = !row.name.trim() || !row.categoryId || !row.paymentMethod
                    return (
                      <div
                        key={row.key}
                        className="grid grid-cols-[120px_1fr_190px_1fr_1fr_32px] items-center gap-2 px-3 py-2"
                      >
                        <Input
                          type="date"
                          value={row.date}
                          onChange={(e) => updateRow(row.key, { date: e.target.value })}
                          className="h-8 text-xs"
                        />
                        <Input
                          value={row.name}
                          onChange={(e) => updateRow(row.key, { name: e.target.value })}
                          className={cn("h-8 text-xs", invalid && !row.name.trim() && "border-destructive")}
                        />
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={row.amount}
                            onChange={(e) => updateRow(row.key, { amount: Number(e.target.value) })}
                            className="h-8 min-w-0 flex-1 text-xs tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() => updateRow(row.key, { isIncome: !row.isIncome })}
                            aria-pressed={row.isIncome}
                            aria-label={row.isIncome ? "Entrada — clique para marcar como despesa" : "Despesa — clique para marcar como entrada"}
                            title={row.isIncome ? "Entrada — clique para marcar como despesa" : "Despesa — clique para marcar como entrada"}
                            className="flex size-7 shrink-0 items-center justify-center rounded-full text-white transition-colors"
                            style={{ backgroundColor: row.isIncome ? FINANCE.income : FINANCE.expense }}
                          >
                            {row.isIncome ? <Plus size={13} /> : <Minus size={13} />}
                          </button>
                        </div>
                        <Select
                          value={row.categoryId || undefined}
                          onValueChange={(v) => updateRow(row.key, { categoryId: v })}
                        >
                          <SelectTrigger className={cn("h-8 text-xs", invalid && !row.categoryId && "border-destructive")}>
                            <SelectValue placeholder="Categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories?.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={row.paymentMethod || undefined}
                          onValueChange={(v) => updateRow(row.key, { paymentMethod: v as PaymentMethod })}
                        >
                          <SelectTrigger className={cn("h-8 text-xs", invalid && !row.paymentMethod && "border-destructive")}>
                            <SelectValue placeholder="Forma" />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHOD_ORDER.map((p) => (
                              <SelectItem key={p} value={p}>{PAYMENT_METHOD_LABELS[p]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                <span className={netTotal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                  {formatCurrency(netTotal)}
                </span>
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
                onClick={() => setStep(step === "review" ? "configure" : "file")}
                disabled={bulkCreate.isPending}
              >
                <ArrowLeft size={14} />
                Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={bulkCreate.isPending}>
              Cancelar
            </Button>
            {step === "file" && rows.length > 0 && (
              <Button type="button" className="gap-2" onClick={() => setStep("configure")}>
                Próximo
                <ArrowRight size={14} />
              </Button>
            )}
            {step === "configure" && (
              <Button type="button" className="gap-2" onClick={goToReview} disabled={!accountId}>
                Próximo: revisar
                <ArrowRight size={14} />
              </Button>
            )}
            {step === "review" && (
              <Button onClick={handleImport} disabled={!canImport || bulkCreate.isPending}>
                {bulkCreate.isPending ? "Importando..." : `Importar${rows.length ? ` (${rows.length})` : ""}`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

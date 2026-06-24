import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v4"
import { Check, Pencil, Plus, Trash2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { FormModal } from "@/components/forms/FormModal"
import { cn } from "@/lib/utils"

// Entidade mínima compartilhada pelos módulos de categoria, forma de pagamento e banco
export interface ColorEntity {
  id: string
  name: string
  color: string
}

interface MutationInput {
  name: string
  color?: string
}

interface ColorEntityCrudProps<T extends ColorEntity> {
  /** Título da página (ex: "Categorias") */
  title: string
  /** Substantivo no singular em minúsculo (ex: "categoria") */
  noun: string
  /** Substantivo no plural em minúsculo (ex: "categorias") */
  nounPlural: string
  /** Gênero gramatical do substantivo, para concordância nos textos */
  gender: "f" | "m"
  /** Ícone exibido no estado vazio */
  emptyIcon: LucideIcon
  /** Placeholder do campo de nome no formulário */
  namePlaceholder: string
  useList: () => UseQueryResult<T[], Error>
  useCreate: () => UseMutationResult<T, Error, MutationInput>
  useUpdate: () => UseMutationResult<T, Error, MutationInput & { id: string }>
  useDelete: () => UseMutationResult<{ success: boolean }, Error, string>
}

const PRESET_COLORS = [
  "#6366f1",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#a855f7",
  "#6b7280",
]

// ── Página genérica ─────────────────────────────────────────────────────────────
export function ColorEntityCrud<T extends ColorEntity>({
  title,
  noun,
  nounPlural,
  gender,
  emptyIcon: EmptyIcon,
  namePlaceholder,
  useList,
  useCreate,
  useUpdate,
  useDelete,
}: ColorEntityCrudProps<T>) {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)
  const [deleting, setDeleting] = useState<T | null>(null)

  const { data: items, isLoading } = useList()
  const deleteMutation = useDelete()

  const count = items?.length ?? 0
  const article = gender === "f" ? "a" : "o"

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {count} {count === 1 ? noun : nounPlural} cadastrad{article}
            {count === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm" className="gap-2">
          <Plus size={15} />
          {gender === "f" ? "Nova" : "Novo"} {noun}
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : count === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <EmptyIcon size={40} className="text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {gender === "f" ? "Nenhuma" : "Nenhum"} {noun} cadastrad{article}
          </p>
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            Adicionar {gender === "f" ? "primeira" : "primeiro"} {noun}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items?.map((item) => (
            <EntityCard
              key={item.id}
              item={item}
              onEdit={() => setEditing(item)}
              onDelete={() => setDeleting(item)}
            />
          ))}
        </div>
      )}

      {/* Modais */}
      <EntityModal
        open={creating}
        onClose={() => setCreating(false)}
        title={`${gender === "f" ? "Nova" : "Novo"} ${noun}`}
        namePlaceholder={namePlaceholder}
        useCreate={useCreate}
        useUpdate={useUpdate}
      />

      {editing && (
        <EntityModal
          open={!!editing}
          onClose={() => setEditing(null)}
          title={`Editar ${noun}`}
          namePlaceholder={namePlaceholder}
          defaultValues={editing}
          useCreate={useCreate}
          useUpdate={useUpdate}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {noun}?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.name}</strong> será {gender === "f" ? "removida" : "removido"}{" "}
              permanentemente. Esta ação não pode ser desfeita.
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

// ── Card ────────────────────────────────────────────────────────────────────────
function EntityCard<T extends ColorEntity>({
  item,
  onEdit,
  onDelete,
}: {
  item: T
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="group relative flex items-center gap-3 overflow-hidden rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
      {/* Barra de cor na lateral */}
      <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: item.color }} />

      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${item.color}1a` }}
      >
        <span className="size-3.5 rounded-full" style={{ backgroundColor: item.color }} />
      </div>

      <p className="min-w-0 flex-1 truncate font-medium">{item.name}</p>

      {/* Ações no hover */}
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar ${item.name}`}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Excluir ${item.name}`}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ── Schema do formulário ──────────────────────────────────────────────────────────
const schema = z.object({
  name: z.string().min(1, "Informe o nome"),
  color: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

// ── Modal de criar/editar ─────────────────────────────────────────────────────────
function EntityModal<T extends ColorEntity>({
  open,
  onClose,
  title,
  namePlaceholder,
  defaultValues,
  useCreate,
  useUpdate,
}: {
  open: boolean
  onClose: () => void
  title: string
  namePlaceholder: string
  defaultValues?: T
  useCreate: () => UseMutationResult<T, Error, MutationInput>
  useUpdate: () => UseMutationResult<T, Error, MutationInput & { id: string }>
}) {
  const create = useCreate()
  const update = useUpdate()

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
      ? { name: defaultValues.name, color: defaultValues.color }
      : { name: "", color: "#6366f1" },
  })

  const selectedColor = watch("color") || "#6366f1"

  const onSubmit = handleSubmit((values) => {
    const finish = () => {
      onClose()
      reset()
    }
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
      onClose={() => {
        onClose()
        reset()
      }}
      title={title}
      formId="color-entity-form"
      onSubmit={onSubmit}
      isPending={isPending}
    >
      <div className="flex flex-col gap-4 py-1">
        <div className="flex flex-col gap-1.5">
          <Label>Nome</Label>
          <Input placeholder={namePlaceholder} autoFocus {...register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label>Cor</Label>
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_COLORS.map((c) => {
              const active = selectedColor.toLowerCase() === c.toLowerCase()
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue("color", c)}
                  aria-label={`Selecionar cor ${c}`}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full transition-transform hover:scale-110",
                    active && "scale-110"
                  )}
                  style={{ backgroundColor: c }}
                >
                  {active && <Check size={14} className="text-white" />}
                </button>
              )
            })}

            {/* Cor personalizada */}
            <label
              className="relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-muted-foreground/40"
              title="Cor personalizada"
              style={{ backgroundColor: selectedColor }}
            >
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => setValue("color", e.target.value)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
              <Plus size={14} className="text-white mix-blend-difference" />
            </label>
          </div>
        </div>
      </div>
    </FormModal>
  )
}

import type { FormEventHandler, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// Casca padrão dos modais com formulário: Dialog + título + form + footer
// (Cancelar / submit com estado de carregando). O botão de submit é associado
// ao form via `form={formId}`, permitindo que ele fique no footer fora do <form>.
export function FormModal({
  open,
  onClose,
  title,
  formId,
  onSubmit,
  isPending,
  submitLabel = "Salvar",
  pendingLabel = "Salvando...",
  size = "md",
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  formId: string
  onSubmit: FormEventHandler<HTMLFormElement>
  isPending: boolean
  submitLabel?: string
  pendingLabel?: string
  size?: "sm" | "md"
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(size === "sm" ? "sm:max-w-sm" : "sm:max-w-md")}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} id={formId}>
          {children}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={isPending}>
            {isPending ? pendingLabel : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

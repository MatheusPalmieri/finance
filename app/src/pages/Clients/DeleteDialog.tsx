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
import { useDeleteClient } from "@/lib/queries"
import type { Client } from "@/types/client"

interface DeleteDialogProps {
  client: Client | null
  onClose: () => void
}

export function DeleteDialog({ client, onClose }: DeleteDialogProps) {
  const del = useDeleteClient()

  function handleConfirm() {
    if (!client) return
    del.mutate(client.id, { onSuccess: onClose })
  }

  return (
    <AlertDialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir cliente</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir{" "}
            <span className="font-semibold text-foreground">
              {client?.name}
            </span>
            ? Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={del.isPending}
            className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
          >
            {del.isPending ? "Excluindo..." : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

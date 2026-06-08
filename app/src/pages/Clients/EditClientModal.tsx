import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { clientSchema, type ClientFormValues } from "@/lib/schemas"
import { useUpdateClient } from "@/lib/queries"
import type { Client } from "@/types/client"
import { ClientForm } from "./ClientForm"

interface EditClientModalProps {
  client: Client | null
  onClose: () => void
}

export function EditClientModal({ client, onClose }: EditClientModalProps) {
  const { control, handleSubmit, formState: { errors } } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    values: {
      name: client?.name ?? "",
      phoneAreaCode: client?.phoneAreaCode ?? "",
      phoneNumber: client?.phoneNumber ?? "",
      city: client?.city ?? "",
      status: client?.status ?? "NOT_STARTED",
    },
  })

  const update = useUpdateClient()

  function onSubmit(values: ClientFormValues) {
    if (!client) return
    update.mutate({ id: client.id, ...values }, { onSuccess: onClose })
  }

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} id="edit-client-form">
          <ClientForm control={control} errors={errors} />
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-client-form" disabled={update.isPending}>
            {update.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

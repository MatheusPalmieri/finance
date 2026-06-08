import { useEffect } from "react"
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
import { useCreateClient } from "@/lib/queries"
import { ClientForm } from "./ClientForm"

const DEFAULT: ClientFormValues = {
  name: "",
  phoneAreaCode: "",
  phoneNumber: "",
  city: "",
  status: "NOT_STARTED",
}

interface CreateClientModalProps {
  open: boolean
  onClose: () => void
}

export function CreateClientModal({ open, onClose }: CreateClientModalProps) {
  const { control, handleSubmit, reset, formState: { errors } } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: DEFAULT,
  })

  const create = useCreateClient()

  useEffect(() => {
    if (!open) reset(DEFAULT)
  }, [open, reset])

  function onSubmit(values: ClientFormValues) {
    create.mutate(values, {
      onSuccess: () => {
        onClose()
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} id="create-client-form">
          <ClientForm control={control} errors={errors} />
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="create-client-form" disabled={create.isPending}>
            {create.isPending ? "Salvando..." : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

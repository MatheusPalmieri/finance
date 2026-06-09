import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormModal } from "@/components/forms/FormModal"
import { clientSchema, type ClientFormValues } from "@/lib/schemas"
import { useUpdateClient } from "@/lib/queries"
import type { Client } from "@/types/client"
import { ClientForm } from "./ClientForm"

interface EditClientModalProps {
  client: Client | null
  onClose: () => void
}

export function EditClientModal({ client, onClose }: EditClientModalProps) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    values: {
      name: client?.name ?? "",
      phoneAreaCode: client?.phoneAreaCode ?? "",
      phoneNumber: client?.phoneNumber ?? "",
      city: client?.city ?? "",
    },
  })

  const update = useUpdateClient()

  function onSubmit(values: ClientFormValues) {
    if (!client) return
    update.mutate({ id: client.id, ...values }, { onSuccess: onClose })
  }

  return (
    <FormModal
      open={!!client}
      onClose={onClose}
      title="Editar cliente"
      formId="edit-client-form"
      onSubmit={handleSubmit(onSubmit)}
      isPending={update.isPending}
    >
      <ClientForm control={control} errors={errors} />
    </FormModal>
  )
}

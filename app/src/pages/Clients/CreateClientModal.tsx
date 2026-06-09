import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormModal } from "@/components/forms/FormModal"
import { clientSchema, type ClientFormValues } from "@/lib/schemas"
import { useCreateClient } from "@/lib/queries"
import { ClientForm } from "./ClientForm"

const DEFAULT: ClientFormValues = {
  name: "",
  phoneAreaCode: "",
  phoneNumber: "",
  city: "",
}

interface CreateClientModalProps {
  open: boolean
  onClose: () => void
}

export function CreateClientModal({ open, onClose }: CreateClientModalProps) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: DEFAULT,
  })

  const create = useCreateClient()

  useEffect(() => {
    if (!open) reset(DEFAULT)
  }, [open, reset])

  function onSubmit(values: ClientFormValues) {
    create.mutate(values, { onSuccess: onClose })
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Novo cliente"
      formId="create-client-form"
      onSubmit={handleSubmit(onSubmit)}
      isPending={create.isPending}
      submitLabel="Criar"
    >
      <ClientForm control={control} errors={errors} />
    </FormModal>
  )
}

import { useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormModal } from "@/components/forms/FormModal"
import { PhaseReasonFields } from "@/components/forms/PhaseReasonFields"
import {
  createClientSchema,
  type CreateClientFormValues,
} from "@/lib/schemas"
import { useCreateClient } from "@/lib/queries"
import { ClientForm } from "./ClientForm"

const DEFAULT: CreateClientFormValues = {
  name: "",
  phoneAreaCode: "",
  phoneNumber: "",
  city: "",
  phase: "PROSPECTING",
  closeReason: undefined,
  messageSent: false,
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
  } = useForm<CreateClientFormValues>({
    resolver: zodResolver(createClientSchema),
    defaultValues: DEFAULT,
  })

  const phase = useWatch({ control, name: "phase" })
  const create = useCreateClient()

  useEffect(() => {
    if (!open) reset(DEFAULT)
  }, [open, reset])

  function onSubmit(values: CreateClientFormValues) {
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
      <div className="grid gap-4">
        <ClientForm control={control} errors={errors} />
        <div className="grid gap-3 border-t pt-4">
          <PhaseReasonFields
            control={control}
            phase={phase}
            phaseName="phase"
            closeReasonName="closeReason"
            messageSentName="messageSent"
          />
        </div>
      </div>
    </FormModal>
  )
}

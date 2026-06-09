import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormModal } from "@/components/forms/FormModal"
import { PhoneFields } from "@/components/forms/PhoneFields"
import { responsibleSchema, type ResponsibleFormValues } from "@/lib/schemas"
import { useUpdateClientResponsible } from "@/lib/queries"
import type { Client } from "@/types/client"

interface ResponsibleModalProps {
  client: Client | null
  onClose: () => void
}

export function ResponsibleModal({ client, onClose }: ResponsibleModalProps) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ResponsibleFormValues>({
    resolver: zodResolver(responsibleSchema),
    values: {
      responsiblePhoneAreaCode: client?.responsiblePhoneAreaCode ?? "",
      responsiblePhoneNumber: client?.responsiblePhoneNumber ?? "",
    },
  })

  const update = useUpdateClientResponsible()

  function onSubmit(values: ResponsibleFormValues) {
    if (!client) return
    update.mutate({ id: client.id, ...values }, { onSuccess: onClose })
  }

  return (
    <FormModal
      open={!!client}
      onClose={onClose}
      title="Telefone do responsável"
      formId="responsible-form"
      onSubmit={handleSubmit(onSubmit)}
      isPending={update.isPending}
      size="sm"
    >
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Cliente:{" "}
          <span className="font-medium text-foreground">{client?.name}</span>
        </p>
        <PhoneFields
          control={control}
          errors={errors}
          areaCodeName="responsiblePhoneAreaCode"
          numberName="responsiblePhoneNumber"
          idPrefix="resp"
        />
      </div>
    </FormModal>
  )
}

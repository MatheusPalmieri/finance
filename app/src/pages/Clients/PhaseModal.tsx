import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormModal } from "@/components/forms/FormModal"
import { PhaseReasonFields } from "@/components/forms/PhaseReasonFields"
import { phaseSchema, type PhaseFormValues } from "@/lib/schemas"
import { useUpdateClientPhase } from "@/lib/queries"
import type { Client } from "@/types/client"

interface PhaseModalProps {
  client: Client | null
  onClose: () => void
}

export function PhaseModal({ client, onClose }: PhaseModalProps) {
  const { control, handleSubmit } = useForm<PhaseFormValues>({
    resolver: zodResolver(phaseSchema),
    values: {
      phase: client?.phase ?? "PROSPECTING",
      closeReason: client?.closeReason ?? undefined,
      messageSent: !!client?.messageSentAt,
    },
  })

  const phase = useWatch({ control, name: "phase" })
  const update = useUpdateClientPhase()

  function onSubmit(values: PhaseFormValues) {
    if (!client) return
    update.mutate({ id: client.id, ...values }, { onSuccess: onClose })
  }

  return (
    <FormModal
      open={!!client}
      onClose={onClose}
      title="Alterar fase/motivo"
      formId="phase-form"
      onSubmit={handleSubmit(onSubmit)}
      isPending={update.isPending}
      submitLabel="Confirmar"
      size="sm"
    >
      <div className="grid gap-3 py-2">
        <p className="text-sm text-muted-foreground">
          Cliente:{" "}
          <span className="font-medium text-foreground">{client?.name}</span>
        </p>

        <PhaseReasonFields
          control={control}
          phase={phase}
          phaseName="phase"
          closeReasonName="closeReason"
          messageSentName="messageSent"
          messageSentDisabled={!!client?.messageSentAt}
        />
      </div>
    </FormModal>
  )
}

import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Checkbox } from "@/components/ui/checkbox"
import { FormModal } from "@/components/forms/FormModal"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { phaseSchema, type PhaseFormValues } from "@/lib/schemas"
import { useUpdateClientPhase } from "@/lib/queries"
import {
  CLIENT_PHASE_LABELS,
  CLOSE_REASON_LABELS,
  type Client,
  type ClientPhase,
  type CloseReason,
} from "@/types/client"

const PHASE_OPTIONS = Object.entries(CLIENT_PHASE_LABELS) as [
  ClientPhase,
  string,
][]
const CLOSE_REASON_OPTIONS = Object.entries(CLOSE_REASON_LABELS) as [
  CloseReason,
  string,
][]

interface PhaseModalProps {
  client: Client | null
  onClose: () => void
}

export function PhaseModal({ client, onClose }: PhaseModalProps) {
  const { control, handleSubmit, watch } = useForm<PhaseFormValues>({
    resolver: zodResolver(phaseSchema),
    values: {
      phase: client?.phase ?? "PROSPECTING",
      closeReason: client?.closeReason ?? undefined,
      messageSent: !!client?.messageSentAt,
    },
  })

  const phase = watch("phase")
  const update = useUpdateClientPhase()

  function onSubmit(values: PhaseFormValues) {
    if (!client) return
    update.mutate({ id: client.id, ...values }, { onSuccess: onClose })
  }

  return (
    <FormModal
      open={!!client}
      onClose={onClose}
      title="Alterar fase"
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

        <div className="grid gap-1.5">
          <Label>Fase</Label>
          <Controller
            name="phase"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHASE_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {phase === "CLOSED" && (
          <div className="grid gap-1.5">
            <Label>Motivo de fechamento</Label>
            <Controller
              name="closeReason"
              control={control}
              render={({ field, fieldState }) => (
                <>
                  <Select
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CLOSE_REASON_OPTIONS.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.error && (
                    <p className="text-xs text-destructive">
                      {fieldState.error.message}
                    </p>
                  )}
                </>
              )}
            />
          </div>
        )}

        {phase === "PROSPECTING" && (
          <Controller
            name="messageSent"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="messageSent"
                  checked={field.value ?? false}
                  onCheckedChange={field.onChange}
                  disabled={!!client?.messageSentAt}
                />
                <Label
                  htmlFor="messageSent"
                  className="cursor-pointer font-normal"
                >
                  Mensagem enviada
                </Label>
              </div>
            )}
          />
        )}
      </div>
    </FormModal>
  )
}

import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CLIENT_PHASE_LABELS,
  CLOSE_REASON_LABELS,
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

// Campos de fase + motivo de fechamento + "mensagem enviada", controlados.
// O motivo só aparece quando a fase é CLOSED; o checkbox só quando PROSPECTING.
// Reutilizado pela criação e pelo modal de alterar fase.
export function PhaseReasonFields<T extends FieldValues>({
  control,
  phase,
  phaseName,
  closeReasonName,
  messageSentName,
  messageSentDisabled,
}: {
  control: Control<T>
  phase: ClientPhase
  phaseName: Path<T>
  closeReasonName: Path<T>
  messageSentName: Path<T>
  messageSentDisabled?: boolean
}) {
  return (
    <>
      <div className="grid gap-1.5">
        <Label>Fase</Label>
        <Controller
          name={phaseName}
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
            name={closeReasonName}
            control={control}
            render={({ field, fieldState }) => (
              <>
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
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
          name={messageSentName}
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="messageSent"
                checked={field.value ?? false}
                onCheckedChange={field.onChange}
                disabled={messageSentDisabled}
              />
              <Label htmlFor="messageSent" className="cursor-pointer font-normal">
                Mensagem enviada
              </Label>
            </div>
          )}
        />
      )}
    </>
  )
}

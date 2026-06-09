import {
  Controller,
  type Control,
  type FieldErrors,
  type FieldValues,
  type Path,
} from "react-hook-form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Par de campos DDD + Telefone controlados (só dígitos), reutilizado pelos
// formulários de cliente e de responsável. Genérico sobre o shape do form.
export function PhoneFields<T extends FieldValues>({
  control,
  errors,
  areaCodeName,
  numberName,
  idPrefix,
}: {
  control: Control<T>
  errors: FieldErrors<T>
  areaCodeName: Path<T>
  numberName: Path<T>
  idPrefix: string
}) {
  const areaError = errors[areaCodeName]?.message as string | undefined
  const numberError = errors[numberName]?.message as string | undefined

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-ddd`}>DDD</Label>
        <Controller
          name={areaCodeName}
          control={control}
          render={({ field }) => (
            <Input
              id={`${idPrefix}-ddd`}
              placeholder="11"
              maxLength={2}
              aria-invalid={!!areaError}
              {...field}
              onChange={(e) =>
                field.onChange(e.target.value.replace(/\D/g, "").slice(0, 2))
              }
            />
          )}
        />
        {areaError && <p className="text-xs text-destructive">{areaError}</p>}
      </div>

      <div className="col-span-2 grid gap-1.5">
        <Label htmlFor={`${idPrefix}-phone`}>Telefone</Label>
        <Controller
          name={numberName}
          control={control}
          render={({ field }) => (
            <Input
              id={`${idPrefix}-phone`}
              placeholder="99999999"
              maxLength={9}
              aria-invalid={!!numberError}
              {...field}
              onChange={(e) =>
                field.onChange(e.target.value.replace(/\D/g, "").slice(0, 9))
              }
            />
          )}
        />
        {numberError && (
          <p className="text-xs text-destructive">{numberError}</p>
        )}
      </div>
    </div>
  )
}

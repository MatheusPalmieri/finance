import {
  Controller,
  type Control,
  type FieldErrors,
  type Path,
} from "react-hook-form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PhoneFields } from "@/components/forms/PhoneFields"
import type { ClientFormValues } from "@/lib/schemas"

// Genérico sobre qualquer form que contenha os campos gerais do cliente, para
// ser reutilizado tanto na edição (ClientFormValues) quanto na criação, que
// estende o schema com fase/motivo.
interface ClientFormProps<T extends ClientFormValues> {
  control: Control<T>
  errors: FieldErrors<T>
}

export function ClientForm<T extends ClientFormValues = ClientFormValues>({
  control,
  errors,
}: ClientFormProps<T>) {
  const formErrors = errors as FieldErrors<ClientFormValues>
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nome</Label>
        <Controller
          name={"name" as Path<T>}
          control={control}
          render={({ field }) => (
            <Input
              id="name"
              placeholder="Nome do cliente"
              aria-invalid={!!formErrors.name}
              {...field}
            />
          )}
        />
        {formErrors.name && (
          <p className="text-xs text-destructive">{formErrors.name.message}</p>
        )}
      </div>

      <PhoneFields
        control={control}
        errors={errors}
        areaCodeName={"phoneAreaCode" as Path<T>}
        numberName={"phoneNumber" as Path<T>}
        idPrefix="client"
      />

      <div className="grid gap-1.5">
        <Label htmlFor="city">Cidade</Label>
        <Controller
          name={"city" as Path<T>}
          control={control}
          render={({ field }) => (
            <Input
              id="city"
              placeholder="São Paulo"
              aria-invalid={!!formErrors.city}
              {...field}
            />
          )}
        />
        {formErrors.city && (
          <p className="text-xs text-destructive">{formErrors.city.message}</p>
        )}
      </div>
    </div>
  )
}

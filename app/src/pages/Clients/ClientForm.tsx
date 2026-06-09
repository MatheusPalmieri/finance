import { Controller, type Control, type FieldErrors } from "react-hook-form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PhoneFields } from "@/components/forms/PhoneFields"
import type { ClientFormValues } from "@/lib/schemas"

interface ClientFormProps {
  control: Control<ClientFormValues>
  errors: FieldErrors<ClientFormValues>
}

export function ClientForm({ control, errors }: ClientFormProps) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nome</Label>
        <Controller
          name="name"
          control={control}
          render={({ field }) => (
            <Input
              id="name"
              placeholder="Nome do cliente"
              aria-invalid={!!errors.name}
              {...field}
            />
          )}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <PhoneFields
        control={control}
        errors={errors}
        areaCodeName="phoneAreaCode"
        numberName="phoneNumber"
        idPrefix="client"
      />

      <div className="grid gap-1.5">
        <Label htmlFor="city">Cidade</Label>
        <Controller
          name="city"
          control={control}
          render={({ field }) => (
            <Input
              id="city"
              placeholder="São Paulo"
              aria-invalid={!!errors.city}
              {...field}
            />
          )}
        />
        {errors.city && (
          <p className="text-xs text-destructive">{errors.city.message}</p>
        )}
      </div>
    </div>
  )
}

import { Controller, type Control, type FieldErrors } from "react-hook-form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CLIENT_STATUS_LABELS, type ClientStatus } from "@/types/client"
import type { ClientFormValues } from "@/lib/schemas"

const STATUS_OPTIONS = Object.entries(CLIENT_STATUS_LABELS) as [ClientStatus, string][]

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

      <div className="grid grid-cols-3 gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="phoneAreaCode">DDD</Label>
          <Controller
            name="phoneAreaCode"
            control={control}
            render={({ field }) => (
              <Input
                id="phoneAreaCode"
                placeholder="11"
                maxLength={2}
                aria-invalid={!!errors.phoneAreaCode}
                {...field}
                onChange={(e) =>
                  field.onChange(e.target.value.replace(/\D/g, "").slice(0, 2))
                }
              />
            )}
          />
          {errors.phoneAreaCode && (
            <p className="text-xs text-destructive">{errors.phoneAreaCode.message}</p>
          )}
        </div>

        <div className="col-span-2 grid gap-1.5">
          <Label htmlFor="phoneNumber">Telefone</Label>
          <Controller
            name="phoneNumber"
            control={control}
            render={({ field }) => (
              <Input
                id="phoneNumber"
                placeholder="99999999"
                maxLength={9}
                aria-invalid={!!errors.phoneNumber}
                {...field}
                onChange={(e) =>
                  field.onChange(e.target.value.replace(/\D/g, "").slice(0, 9))
                }
              />
            )}
          />
          {errors.phoneNumber && (
            <p className="text-xs text-destructive">{errors.phoneNumber.message}</p>
          )}
        </div>
      </div>

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

      <div className="grid gap-1.5">
        <Label htmlFor="status">Status</Label>
        <Controller
          name="status"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="status" className="w-full" aria-invalid={!!errors.status}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
    </div>
  )
}

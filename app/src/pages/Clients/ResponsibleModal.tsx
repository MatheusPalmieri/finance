import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Telefone do responsável</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} id="responsible-form">
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Cliente:{" "}
              <span className="font-medium text-foreground">{client?.name}</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="resp-ddd">DDD</Label>
                <Controller
                  name="responsiblePhoneAreaCode"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="resp-ddd"
                      placeholder="11"
                      maxLength={2}
                      aria-invalid={!!errors.responsiblePhoneAreaCode}
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value.replace(/\D/g, "").slice(0, 2))
                      }
                    />
                  )}
                />
                {errors.responsiblePhoneAreaCode && (
                  <p className="text-xs text-destructive">
                    {errors.responsiblePhoneAreaCode.message}
                  </p>
                )}
              </div>
              <div className="col-span-2 grid gap-1.5">
                <Label htmlFor="resp-phone">Telefone</Label>
                <Controller
                  name="responsiblePhoneNumber"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="resp-phone"
                      placeholder="99999999"
                      maxLength={9}
                      aria-invalid={!!errors.responsiblePhoneNumber}
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value.replace(/\D/g, "").slice(0, 9))
                      }
                    />
                  )}
                />
                {errors.responsiblePhoneNumber && (
                  <p className="text-xs text-destructive">
                    {errors.responsiblePhoneNumber.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="responsible-form" disabled={update.isPending}>
            {update.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

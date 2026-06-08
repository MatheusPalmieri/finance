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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { statusSchema, type StatusFormValues } from "@/lib/schemas"
import { useUpdateClientStatus } from "@/lib/queries"
import { CLIENT_STATUS_LABELS, type Client, type ClientStatus } from "@/types/client"

const STATUS_OPTIONS = Object.entries(CLIENT_STATUS_LABELS) as [ClientStatus, string][]

interface StatusModalProps {
  client: Client | null
  onClose: () => void
}

export function StatusModal({ client, onClose }: StatusModalProps) {
  const { control, handleSubmit } = useForm<StatusFormValues>({
    resolver: zodResolver(statusSchema),
    values: { status: client?.status ?? "NOT_STARTED" },
  })

  const update = useUpdateClientStatus()

  function onSubmit({ status }: StatusFormValues) {
    if (!client) return
    update.mutate({ id: client.id, status }, { onSuccess: onClose })
  }

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Alterar status</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} id="status-form">
          <div className="grid gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              Cliente:{" "}
              <span className="font-medium text-foreground">{client?.name}</span>
            </p>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
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
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="status-form" disabled={update.isPending}>
            {update.isPending ? "Salvando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

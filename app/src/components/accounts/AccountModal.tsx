import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v4"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FormModal } from "@/components/forms/FormModal"
import { useUpdateAccount } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { DEFAULT_PICKER_COLOR, PICKER_SWATCHES } from "@/lib/tokens"
import { ACCOUNT_TYPE_LABELS, type Account } from "@/types/finance"

// ── Schema ────────────────────────────────────────────────────────────────────
// Contas nascem do Open Finance: só a aparência é editável. Tipo e saldo são
// do banco.
const schema = z.object({
  name: z.string().min(1, "Informe o nome"),
  color: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

// ── Modal de aparência ────────────────────────────────────────────────────────
export function AccountModal({
  open,
  onClose,
  account,
}: {
  open: boolean
  onClose: () => void
  account: Account
}) {
  const update = useUpdateAccount()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: account.name, color: account.color },
  })

  const selectedColor = watch("color") ?? DEFAULT_PICKER_COLOR

  const onSubmit = handleSubmit((values) => {
    update.mutate(
      { id: account.id, ...values },
      {
        onSuccess: () => {
          onClose()
          reset()
        },
      }
    )
  })

  return (
    <FormModal
      open={open}
      onClose={() => {
        onClose()
        reset()
      }}
      title="Editar conta"
      formId="account-form"
      onSubmit={onSubmit}
      isPending={update.isPending}
    >
      <div className="flex flex-col gap-4 py-1">
        <p className="text-xs text-muted-foreground">
          {ACCOUNT_TYPE_LABELS[account.type]} · tipo e saldo vêm do Open Finance
        </p>

        <div className="flex flex-col gap-1.5">
          <Label>Nome</Label>
          <Input placeholder="Ex: Nubank" {...register("name")} />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-2">
            {PICKER_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setValue("color", c)}
                aria-label={`Selecionar cor ${c}`}
                className={cn(
                  "size-9 rounded-full transition-transform hover:scale-110 sm:size-7",
                  selectedColor === c &&
                    "scale-110 ring-2 ring-ring ring-offset-2 ring-offset-background"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </FormModal>
  )
}

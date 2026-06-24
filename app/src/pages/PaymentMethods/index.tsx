import { CreditCard } from "lucide-react"
import { ColorEntityCrud } from "@/components/crud/ColorEntityCrud"
import {
  useCreatePaymentMethod,
  useDeletePaymentMethod,
  usePaymentMethods,
  useUpdatePaymentMethod,
} from "@/lib/queries"

export function PaymentMethods() {
  return (
    <ColorEntityCrud
      title="Formas de pagamento"
      noun="forma de pagamento"
      nounPlural="formas de pagamento"
      gender="f"
      emptyIcon={CreditCard}
      namePlaceholder="Ex: Pix"
      useList={usePaymentMethods}
      useCreate={useCreatePaymentMethod}
      useUpdate={useUpdatePaymentMethod}
      useDelete={useDeletePaymentMethod}
    />
  )
}

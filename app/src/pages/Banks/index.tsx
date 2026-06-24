import { Landmark } from "lucide-react"
import { ColorEntityCrud } from "@/components/crud/ColorEntityCrud"
import { useBanks, useCreateBank, useDeleteBank, useUpdateBank } from "@/lib/queries"

export function Banks() {
  return (
    <ColorEntityCrud
      title="Bancos"
      noun="banco"
      nounPlural="bancos"
      gender="m"
      emptyIcon={Landmark}
      namePlaceholder="Ex: Nubank"
      useList={useBanks}
      useCreate={useCreateBank}
      useUpdate={useUpdateBank}
      useDelete={useDeleteBank}
    />
  )
}

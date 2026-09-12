import { Wallet } from "lucide-react"
import { ColorEntityCrud } from "@/components/crud/ColorEntityCrud"
import {
  useCreateWallet,
  useDeleteWallet,
  useUpdateWallet,
  useWallets,
} from "@/lib/queries"

export function Wallets() {
  return (
    <ColorEntityCrud
      title="Carteiras"
      noun="carteira"
      nounPlural="carteiras"
      gender="f"
      emptyIcon={Wallet}
      namePlaceholder="Ex: Carteira Pessoal"
      useList={useWallets}
      useCreate={useCreateWallet}
      useUpdate={useUpdateWallet}
      useDelete={useDeleteWallet}
    />
  )
}

import { Tag } from "lucide-react"
import { ColorEntityCrud } from "@/components/crud/ColorEntityCrud"
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/lib/queries"

export function Categories() {
  return (
    <ColorEntityCrud
      title="Categorias"
      noun="categoria"
      nounPlural="categorias"
      gender="f"
      emptyIcon={Tag}
      namePlaceholder="Ex: Alimentação"
      useList={useCategories}
      useCreate={useCreateCategory}
      useUpdate={useUpdateCategory}
      useDelete={useDeleteCategory}
    />
  )
}

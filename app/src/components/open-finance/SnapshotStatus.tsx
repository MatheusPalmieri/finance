import { snapshotAge } from "@/lib/format"
import { FINANCE, PALETTE } from "@/lib/tokens"
import { cn } from "@/lib/utils"
import type { SnapshotMeta } from "@/types/finance"

/**
 * Selo de procedência do dado do Open Finance. Sempre diz quando o banco
 * mandou o valor e avisa quando é o último conhecido (Pluggy fora do ar) —
 * o app nunca mostra número sem dizer de quando ele é.
 */
export function SnapshotStatus({
  meta,
  className,
}: {
  meta: SnapshotMeta
  className?: string
}) {
  const { label, color, title } = !meta.available
    ? {
        label: "indisponível",
        color: FINANCE.neutral,
        title: meta.error ?? "Sem dado do Open Finance",
      }
    : meta.stale
      ? {
          label: `desatualizado · ${snapshotAge(meta.fetchedAt!)}`,
          color: PALETTE.amber,
          title: `Banco fora do ar agora (${meta.error}). Mostrando o último dado recebido.`,
        }
      : {
          label: `atualizado ${snapshotAge(meta.fetchedAt!)}`,
          color: FINANCE.income,
          title: "Dado do Open Finance salvo no banco",
        }

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground",
        className
      )}
      title={title}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  )
}

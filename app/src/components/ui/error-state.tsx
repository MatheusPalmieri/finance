import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

// Estado de erro padrão para falhas de carregamento de dados (queries).
// Centraliza o feedback visual e o botão de "tentar novamente" usado nas páginas.
export function ErrorState({
  message = "Não foi possível carregar os dados.",
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle size={24} />
      </span>
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="gap-2" onClick={onRetry}>
          <RefreshCw size={14} />
          Tentar novamente
        </Button>
      )}
    </div>
  )
}

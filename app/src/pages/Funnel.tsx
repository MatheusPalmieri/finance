const STAGES = [
  { label: "Não iniciado", count: 80, color: "bg-muted" },
  { label: "Mensagem enviada", count: 55, color: "bg-blue-400" },
  { label: "Negociando", count: 34, color: "bg-amber-400" },
  { label: "Trial", count: 12, color: "bg-emerald-400" },
  { label: "Fechado", count: 7, color: "bg-primary" },
]

export function Funnel() {
  const max = STAGES[0].count

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Funil</h1>
        <p className="text-sm text-muted-foreground">Visão em funil (mockado)</p>
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
        {STAGES.map((stage) => (
          <div key={stage.label} className="flex items-center gap-4">
            <span className="w-36 text-right text-sm text-muted-foreground">
              {stage.label}
            </span>
            <div className="flex-1 rounded bg-muted/40">
              <div
                className={`h-9 rounded ${stage.color} transition-all`}
                style={{ width: `${(stage.count / max) * 100}%` }}
              />
            </div>
            <span className="w-8 text-sm font-medium">{stage.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

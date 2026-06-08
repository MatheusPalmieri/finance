const MOCK_KPI = [
  { label: "Taxa de conversão", value: "14%", delta: "+2%" },
  { label: "Ticket médio", value: "R$ 890", delta: "+5%" },
  { label: "Tempo médio no funil", value: "18 dias", delta: "-3 dias" },
  { label: "NPS estimado", value: "72", delta: "+4" },
]

export function Dashboard() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">KPIs principais (mockado)</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {MOCK_KPI.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
            <p className="mt-1 text-3xl font-bold">{kpi.value}</p>
            <p className="mt-1 text-xs text-emerald-500">{kpi.delta} vs mês anterior</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        Gráficos e análises avançadas serão implementados em breve.
      </div>
    </div>
  )
}

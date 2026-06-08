const MOCK_ROWS = [
  { month: "Janeiro", new: 18, closed: 4, trial: 3 },
  { month: "Fevereiro", new: 24, closed: 6, trial: 5 },
  { month: "Março", new: 31, closed: 9, trial: 7 },
  { month: "Abril", new: 28, closed: 7, trial: 6 },
  { month: "Maio", new: 35, closed: 11, trial: 8 },
  { month: "Junho", new: 22, closed: 7, trial: 4 },
]

export function Reports() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Dados mensais (mockado)</p>
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Mês</th>
              <th className="px-4 py-3 text-right font-medium">Novos</th>
              <th className="px-4 py-3 text-right font-medium">Fechados</th>
              <th className="px-4 py-3 text-right font-medium">Trial</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {MOCK_ROWS.map((row) => (
              <tr key={row.month}>
                <td className="px-4 py-3">{row.month}</td>
                <td className="px-4 py-3 text-right">{row.new}</td>
                <td className="px-4 py-3 text-right">{row.closed}</td>
                <td className="px-4 py-3 text-right">{row.trial}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

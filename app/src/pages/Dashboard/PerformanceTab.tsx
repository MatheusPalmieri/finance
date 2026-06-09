import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { DollarSign, Percent, Target, Trophy } from "lucide-react"
import { ChartCard, ChartTooltip, StatCard } from "@/components/charts"
import {
  axisTick,
  CHART_COLORS,
  CHART_PALETTE,
  fmtBRL,
  fmtBRLk,
  fmtNum,
  gridStroke,
} from "@/lib/charts"
import { citiesPerf, sdrs, teamGoal } from "./mock"

export function PerformanceTab() {
  const teamPct = Math.round((teamGoal.achieved / teamGoal.target) * 100)
  const avgConv = (
    sdrs.reduce((s, x) => s + x.convRate, 0) / sdrs.length
  ).toFixed(1)
  const totalRevenue = sdrs.reduce((s, x) => s + x.revenue, 0)
  const top = sdrs[0]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Conversões do time"
          value={fmtNum(teamGoal.achieved)}
          delta={`${teamPct}% da meta`}
          trend={teamPct >= 100 ? "up" : "neutral"}
          icon={Target}
          accent={CHART_COLORS.emerald}
          delay={0}
        />
        <StatCard
          label="Top SDR"
          value={top.name.split(" ")[0]}
          hint={`${top.conversions} conversões`}
          icon={Trophy}
          accent={CHART_COLORS.amber}
          delay={60}
        />
        <StatCard
          label="Conversão média"
          value={`${avgConv}%`}
          hint="do time"
          icon={Percent}
          accent={CHART_COLORS.violet}
          delay={120}
        />
        <StatCard
          label="Receita gerada"
          value={fmtBRL(totalRevenue)}
          hint="atribuída ao time"
          icon={DollarSign}
          accent={CHART_COLORS.blue}
          delay={180}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Meta do mês"
          subtitle={`${teamGoal.achieved} de ${teamGoal.target} conversões`}
          delay={220}
        >
          <div className="relative h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="68%"
                outerRadius="100%"
                data={[{ value: teamPct }]}
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar
                  background
                  dataKey="value"
                  cornerRadius={10}
                  fill={
                    teamPct >= 100 ? CHART_COLORS.emerald : CHART_COLORS.amber
                  }
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold tabular-nums">
                {teamPct}%
              </span>
              <span className="text-xs text-muted-foreground">
                da meta atingida
              </span>
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Conversões por SDR"
          subtitle="Clientes fechados no período"
          className="lg:col-span-2"
          delay={260}
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sdrs}
                layout="vertical"
                margin={{ top: 0, right: 36, left: 8, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={104}
                  tickFormatter={(v: string) => v.split(" ")[0]}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  content={<ChartTooltip />}
                />
                <Bar
                  dataKey="conversions"
                  name="Conversões"
                  radius={[0, 4, 4, 0]}
                  animationDuration={700}
                >
                  {sdrs.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                    />
                  ))}
                  <LabelList
                    dataKey="conversions"
                    position="right"
                    className="fill-foreground"
                    fontSize={11}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title="Ranking de SDRs"
        subtitle="Desempenho individual"
        delay={300}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pr-2 pb-2 font-medium">SDR</th>
                <th className="px-2 pb-2 text-right font-medium">Leads</th>
                <th className="px-2 pb-2 text-right font-medium">Conversões</th>
                <th className="px-2 pb-2 text-right font-medium">Conv.</th>
                <th className="px-2 pb-2 text-right font-medium">Receita</th>
                <th className="pb-2 pl-2 font-medium">Meta</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sdrs.map((s, i) => (
                <tr
                  key={s.name}
                  className="transition-colors hover:bg-muted/40"
                >
                  <td className="py-2.5 pr-2">
                    <span className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">
                        {i + 1}
                      </span>
                      {s.name}
                    </span>
                  </td>
                  <td className="px-2 text-right text-muted-foreground tabular-nums">
                    {s.leads}
                  </td>
                  <td className="px-2 text-right font-medium tabular-nums">
                    {s.conversions}
                  </td>
                  <td className="px-2 text-right text-muted-foreground tabular-nums">
                    {s.convRate}%
                  </td>
                  <td className="px-2 text-right tabular-nums">
                    {fmtBRLk(s.revenue)}
                  </td>
                  <td className="py-2.5 pl-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(s.meta, 100)}%`,
                            backgroundColor:
                              s.meta >= 100
                                ? CHART_COLORS.emerald
                                : CHART_COLORS.amber,
                          }}
                        />
                      </div>
                      <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
                        {s.meta}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <ChartCard
        title="Clientes por cidade"
        subtitle="Distribuição geográfica da base"
        delay={340}
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={citiesPerf}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid
                stroke={gridStroke}
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="city"
                tick={{ ...axisTick, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={48}
              />
              <YAxis
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                content={<ChartTooltip suffix=" clientes" />}
              />
              <Bar
                dataKey="customers"
                name="Clientes"
                fill={CHART_COLORS.indigo}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                animationDuration={700}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  )
}

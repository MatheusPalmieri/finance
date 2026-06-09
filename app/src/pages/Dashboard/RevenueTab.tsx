import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Banknote, Coins, DollarSign, Gem, Scale, Ticket } from "lucide-react"
import { ChartCard, ChartTooltip, StatCard } from "@/components/charts"
import {
  axisTick,
  CHART_COLORS,
  fmtBRL,
  fmtBRLk,
  gridStroke,
} from "@/lib/charts"
import { acquisition, kpis, plans, revenueByMonth } from "./mock"

export function RevenueTab() {
  const mrrSplit = revenueByMonth.map((m) => ({
    month: m.month,
    base: m.mrr - m.expansion,
    expansion: m.expansion,
  }))
  const ltvCac = (kpis.ltv / kpis.cac).toFixed(1)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard
          label="MRR"
          value={fmtBRL(kpis.mrr)}
          delta={`+${kpis.mrrGrowth}%`}
          trend="up"
          icon={DollarSign}
          accent={CHART_COLORS.emerald}
          delay={0}
        />
        <StatCard
          label="ARR"
          value={fmtBRL(kpis.arr)}
          hint="receita anualizada"
          icon={Banknote}
          accent={CHART_COLORS.blue}
          delay={60}
        />
        <StatCard
          label="Ticket médio"
          value={fmtBRL(kpis.ticket)}
          hint="por cliente / mês"
          icon={Ticket}
          accent={CHART_COLORS.violet}
          delay={120}
        />
        <StatCard
          label="LTV"
          value={fmtBRL(kpis.ltv)}
          hint="lifetime value"
          icon={Gem}
          accent={CHART_COLORS.indigo}
          delay={180}
        />
        <StatCard
          label="CAC"
          value={fmtBRL(kpis.cac)}
          hint="custo de aquisição"
          icon={Coins}
          accent={CHART_COLORS.amber}
          delay={240}
        />
        <StatCard
          label="LTV / CAC"
          value={`${ltvCac}x`}
          delta="saudável"
          trend="up"
          hint="ideal > 3x"
          icon={Scale}
          accent={CHART_COLORS.cyan}
          delay={300}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Composição do MRR"
          subtitle="Base recorrente + expansão (upsell)"
          className="lg:col-span-2"
          delay={340}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={mrrSplit}
                margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={CHART_COLORS.blue}
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor={CHART_COLORS.blue}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={CHART_COLORS.emerald}
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="100%"
                      stopColor={CHART_COLORS.emerald}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke={gridStroke}
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v) => fmtBRLk(v as number)}
                />
                <Tooltip content={<ChartTooltip format={fmtBRL} />} />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                />
                <Area
                  type="monotone"
                  dataKey="base"
                  name="Base"
                  stackId="1"
                  stroke={CHART_COLORS.blue}
                  strokeWidth={2}
                  fill="url(#baseGrad)"
                  animationDuration={700}
                />
                <Area
                  type="monotone"
                  dataKey="expansion"
                  name="Expansão"
                  stackId="1"
                  stroke={CHART_COLORS.emerald}
                  strokeWidth={2}
                  fill="url(#expGrad)"
                  animationDuration={700}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Aquisição de receita"
          subtitle="Origem dos clientes (%)"
          delay={400}
        >
          <div className="relative h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<ChartTooltip suffix="%" />} />
                <Pie
                  data={acquisition}
                  dataKey="value"
                  nameKey="source"
                  innerRadius={48}
                  outerRadius={74}
                  paddingAngle={2}
                  stroke="var(--background)"
                  strokeWidth={2}
                  animationDuration={700}
                >
                  {acquisition.map((a) => (
                    <Cell key={a.source} fill={a.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {acquisition.map((a) => (
              <div key={a.source} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: a.color }}
                />
                <span className="truncate text-muted-foreground">
                  {a.source}
                </span>
                <span className="ml-auto font-medium tabular-nums">
                  {a.value}%
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title="Receita por plano"
        subtitle="MRR gerado por cada plano"
        delay={440}
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={plans}
              layout="vertical"
              margin={{ top: 0, right: 56, left: 8, bottom: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                content={<ChartTooltip format={fmtBRL} />}
              />
              <Bar
                dataKey="mrr"
                name="MRR"
                radius={[0, 4, 4, 0]}
                animationDuration={700}
              >
                {plans.map((p) => (
                  <Cell key={p.name} fill={p.color} />
                ))}
                <LabelList
                  dataKey="mrr"
                  position="right"
                  className="fill-foreground"
                  fontSize={11}
                  formatter={(v) => fmtBRLk(Number(v))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  )
}

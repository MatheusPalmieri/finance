import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Activity,
  DollarSign,
  MessageSquare,
  Reply,
  TrendingUp,
  UserMinus,
} from "lucide-react"
import { ChartCard, ChartTooltip, StatCard } from "@/components/charts"
import {
  axisTick,
  CHART_COLORS,
  fmtBRL,
  fmtBRLk,
  fmtNum,
  gridStroke,
} from "@/lib/charts"
import { kpis, plans, revenueByMonth } from "./mock"

export function OverviewTab() {
  const totalCustomers = plans.reduce((s, p) => s + p.customers, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard
          label="MRR"
          value={fmtBRL(kpis.mrr)}
          delta={`+${kpis.mrrGrowth}%`}
          trend="up"
          hint="receita recorrente mensal"
          icon={DollarSign}
          accent={CHART_COLORS.emerald}
          delay={0}
        />
        <StatCard
          label="Clientes ativos"
          value={fmtNum(kpis.activeCustomers)}
          delta={`+${kpis.newCustomers} no mês`}
          trend="up"
          icon={Activity}
          accent={CHART_COLORS.blue}
          delay={60}
        />
        <StatCard
          label="Disparos (30d)"
          value={fmtNum(kpis.messagesSent)}
          hint="mensagens enviadas"
          icon={MessageSquare}
          accent={CHART_COLORS.violet}
          delay={120}
        />
        <StatCard
          label="Taxa de resposta"
          value={`${kpis.responseRate}%`}
          hint="respostas / disparos"
          icon={Reply}
          accent={CHART_COLORS.amber}
          delay={180}
        />
        <StatCard
          label="Conversão"
          value={`${kpis.conversionRate}%`}
          delta="+1.8pp"
          trend="up"
          hint="lead → cliente"
          icon={TrendingUp}
          accent={CHART_COLORS.indigo}
          delay={240}
        />
        <StatCard
          label="Churn"
          value={`${kpis.churnRate}%`}
          delta="-0.3pp"
          trend="up"
          hint="cancelamentos / base"
          icon={UserMinus}
          accent={CHART_COLORS.rose}
          delay={300}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Receita recorrente (MRR)"
          subtitle="Evolução nos últimos 12 meses"
          className="lg:col-span-2"
          delay={340}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={revenueByMonth}
                margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.emerald} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CHART_COLORS.emerald} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v) => fmtBRLk(v as number)}
                />
                <Tooltip content={<ChartTooltip format={fmtBRL} />} />
                <Area
                  type="monotone"
                  dataKey="mrr"
                  name="MRR"
                  stroke={CHART_COLORS.emerald}
                  strokeWidth={2}
                  fill="url(#mrrGrad)"
                  animationDuration={700}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Clientes por plano"
          subtitle={`${totalCustomers} assinantes`}
          delay={400}
        >
          <div className="relative h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<ChartTooltip suffix=" clientes" />} />
                <Pie
                  data={plans}
                  dataKey="customers"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={74}
                  paddingAngle={2}
                  stroke="var(--background)"
                  strokeWidth={2}
                  animationDuration={700}
                >
                  {plans.map((p) => (
                    <Cell key={p.name} fill={p.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums">{totalCustomers}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                clientes
              </span>
            </div>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {plans.map((p) => (
              <div key={p.name} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="text-muted-foreground">{p.name}</span>
                <span className="ml-auto font-medium tabular-nums">{p.customers}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title="Aquisição e perda de clientes"
        subtitle="Novos vs. cancelados por mês, com taxa de conversão"
        delay={440}
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={revenueByMonth}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={axisTick} axisLine={false} tickLine={false} width={32} />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              />
              <Bar
                yAxisId="left"
                dataKey="newCustomers"
                name="Novos"
                fill={CHART_COLORS.emerald}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                animationDuration={700}
              />
              <Bar
                yAxisId="left"
                dataKey="churned"
                name="Cancelados"
                fill={CHART_COLORS.rose}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                animationDuration={700}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="conversion"
                name="Conversão %"
                stroke={CHART_COLORS.violet}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS.violet }}
                animationDuration={700}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  )
}

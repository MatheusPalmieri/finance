import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { CheckCheck, MessageSquare, Reply, Send } from "lucide-react"
import { ChartCard, ChartTooltip, StatCard } from "@/components/charts"
import {
  axisTick,
  CHART_COLORS,
  fmtCompact,
  fmtNum,
  gridStroke,
} from "@/lib/charts"
import {
  channels,
  dailyMessaging,
  heatMax,
  heatmap,
  HEAT_DAYS,
  HEAT_HOURS,
  messageStatusByChannel,
  type Period,
} from "./mock"

export function MessagingTab({ period }: { period: Period }) {
  const n = period === "30d" ? 30 : 90
  const daily = dailyMessaging.slice(-n)

  const sent = daily.reduce((s, d) => s + d.sent, 0)
  const delivered = daily.reduce((s, d) => s + d.delivered, 0)
  const replied = daily.reduce((s, d) => s + d.replied, 0)
  const optOut = daily.reduce((s, d) => s + d.optOut, 0)
  const deliverability = ((delivered / sent) * 100).toFixed(1)
  const responseRate = ((replied / delivered) * 100).toFixed(1)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Disparos"
          value={fmtNum(sent)}
          hint={`últimos ${n} dias`}
          icon={Send}
          accent={CHART_COLORS.blue}
          delay={0}
        />
        <StatCard
          label="Entregabilidade"
          value={`${deliverability}%`}
          hint={`${fmtNum(delivered)} entregues`}
          icon={CheckCheck}
          accent={CHART_COLORS.cyan}
          delay={60}
        />
        <StatCard
          label="Respondidas"
          value={fmtNum(replied)}
          delta={`${responseRate}%`}
          trend="up"
          hint="taxa de resposta"
          icon={Reply}
          accent={CHART_COLORS.emerald}
          delay={120}
        />
        <StatCard
          label="Opt-outs"
          value={fmtNum(optOut)}
          hint={`${((optOut / delivered) * 100).toFixed(1)}% dos entregues`}
          icon={MessageSquare}
          accent={CHART_COLORS.rose}
          delay={180}
        />
      </div>

      <ChartCard
        title="Volume de disparos"
        subtitle="Enviadas, entregues e respondidas por dia"
        delay={220}
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={daily}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid
                stroke={gridStroke}
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={32}
              />
              <YAxis
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              />
              <Line
                type="monotone"
                dataKey="sent"
                name="Enviadas"
                stroke={CHART_COLORS.blue}
                strokeWidth={2}
                dot={false}
                animationDuration={700}
              />
              <Line
                type="monotone"
                dataKey="delivered"
                name="Entregues"
                stroke={CHART_COLORS.cyan}
                strokeWidth={2}
                dot={false}
                animationDuration={700}
              />
              <Line
                type="monotone"
                dataKey="replied"
                name="Respondidas"
                stroke={CHART_COLORS.emerald}
                strokeWidth={2}
                dot={false}
                animationDuration={700}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard
          title="Status por canal"
          subtitle="Desfecho das mensagens entregues"
          className="lg:col-span-3"
          delay={260}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={messageStatusByChannel}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid
                  stroke={gridStroke}
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="channel"
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={(v) => fmtCompact(v as number)}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                />
                <Bar
                  dataKey="Respondido"
                  stackId="a"
                  fill={CHART_COLORS.emerald}
                  animationDuration={700}
                />
                <Bar
                  dataKey="Sem resposta"
                  stackId="a"
                  fill={CHART_COLORS.slate}
                  animationDuration={700}
                />
                <Bar
                  dataKey="Opt-out"
                  stackId="a"
                  fill={CHART_COLORS.amber}
                  animationDuration={700}
                />
                <Bar
                  dataKey="Não entregue"
                  stackId="a"
                  fill={CHART_COLORS.rose}
                  radius={[4, 4, 0, 0]}
                  animationDuration={700}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Volume por canal"
          subtitle="Disparos totais"
          className="lg:col-span-2"
          delay={300}
        >
          <div className="relative h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<ChartTooltip suffix=" disparos" />} />
                <Pie
                  data={channels}
                  dataKey="sent"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={74}
                  paddingAngle={2}
                  stroke="var(--background)"
                  strokeWidth={2}
                  animationDuration={700}
                >
                  {channels.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {channels.map((c) => (
              <div key={c.name} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                <span className="text-muted-foreground">{c.name}</span>
                <span className="ml-auto font-medium tabular-nums">
                  {c.responseRate}%
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title="Melhor horário de disparo"
        subtitle="Taxa de resposta (%) por dia da semana e horário"
        delay={340}
      >
        <Heatmap />
      </ChartCard>
    </div>
  )
}

// rgba do azul da paleta com alpha proporcional à intensidade
function heatColor(rate: number) {
  const alpha = 0.08 + 0.92 * (rate / heatMax)
  return `rgba(59, 130, 246, ${alpha.toFixed(2)})`
}

function Heatmap() {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-120">
        {/* Cabeçalho de horários */}
        <div className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1.5 pl-1">
          <div />
          {HEAT_HOURS.map((h) => (
            <div
              key={h}
              className="pb-1 text-center text-[10px] text-muted-foreground"
            >
              {h}
            </div>
          ))}
        </div>
        {/* Linhas por dia */}
        {HEAT_DAYS.map((day, di) => (
          <div
            key={day}
            className="mb-1.5 grid grid-cols-[3rem_repeat(7,1fr)] items-center gap-1.5"
          >
            <span className="text-xs font-medium text-muted-foreground">
              {day}
            </span>
            {HEAT_HOURS.map((_, hi) => {
              const cell = heatmap[di][hi]
              return (
                <div
                  key={hi}
                  title={`${day} ${cell.hour} · ${cell.rate}% de resposta`}
                  className="flex h-9 items-center justify-center rounded-md text-[10px] font-medium tabular-nums transition-transform hover:scale-105"
                  style={{
                    backgroundColor: heatColor(cell.rate),
                    color:
                      cell.rate / heatMax > 0.55
                        ? "#fff"
                        : "var(--muted-foreground)",
                  }}
                >
                  {cell.rate}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

import { lazy, Suspense, useState } from "react"
import { DollarSign, LayoutDashboard, Loader2, Send, Trophy } from "lucide-react"
import { SegmentedControl } from "@/components/charts"
import type { Period } from "./mock"

// Cada aba só baixa seu código (e o mock que consome) ao ser aberta.
const OverviewTab = lazy(() =>
  import("./OverviewTab").then((m) => ({ default: m.OverviewTab }))
)
const MessagingTab = lazy(() =>
  import("./MessagingTab").then((m) => ({ default: m.MessagingTab }))
)
const RevenueTab = lazy(() =>
  import("./RevenueTab").then((m) => ({ default: m.RevenueTab }))
)
const PerformanceTab = lazy(() =>
  import("./PerformanceTab").then((m) => ({ default: m.PerformanceTab }))
)

type Tab = "overview" | "messaging" | "revenue" | "performance"

const TABS = [
  { value: "overview" as Tab, label: "Visão geral", icon: LayoutDashboard },
  { value: "messaging" as Tab, label: "Disparos", icon: Send },
  { value: "revenue" as Tab, label: "Receita", icon: DollarSign },
  { value: "performance" as Tab, label: "Performance", icon: Trophy },
]

const PERIODS = [
  { value: "30d" as Period, label: "30 dias" },
  { value: "90d" as Period, label: "90 dias" },
  { value: "12m" as Period, label: "12 meses" },
]

export function Dashboard() {
  const [tab, setTab] = useState<Tab>("overview")
  const [period, setPeriod] = useState<Period>("30d")

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Painel operacional
        </h1>
        <p className="text-sm text-muted-foreground">
          Visão completa da operação de disparos e vendas SaaS
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
        {tab === "messaging" && (
          <SegmentedControl
            options={PERIODS}
            value={period}
            onChange={setPeriod}
          />
        )}
      </div>

      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        }
      >
        {tab === "overview" && <OverviewTab />}
        {tab === "messaging" && <MessagingTab period={period} />}
        {tab === "revenue" && <RevenueTab />}
        {tab === "performance" && <PerformanceTab />}
      </Suspense>
    </div>
  )
}

import { useState } from "react"
import {
  DollarSign,
  LayoutDashboard,
  Send,
  Trophy,
} from "lucide-react"
import { SegmentedControl } from "@/components/charts"
import { OverviewTab } from "./OverviewTab"
import { MessagingTab } from "./MessagingTab"
import { RevenueTab } from "./RevenueTab"
import { PerformanceTab } from "./PerformanceTab"
import type { Period } from "./mock"

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
          <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />
        )}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "messaging" && <MessagingTab period={period} />}
      {tab === "revenue" && <RevenueTab />}
      {tab === "performance" && <PerformanceTab />}
    </div>
  )
}

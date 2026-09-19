export { forecastRoute, settingsRoute } from "./routes"
export * as forecastService from "./service"
export { installmentAmount, totalPaid } from "./installments"
export { simulate, horizonMonths, monthKey, monthLabel } from "./montecarlo"
export { classifyVerdict, computeActions } from "./verdict"
export type {
  CashflowProjection,
  ScenarioEvent,
  Verdict,
} from "./types"

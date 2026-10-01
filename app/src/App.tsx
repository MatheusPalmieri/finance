import { lazy } from "react"
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom"

import { AppLayout } from "@/components/layout/AppLayout"

const Home = lazy(() =>
  import("@/pages/Home").then((m) => ({ default: m.Home }))
)
const Transactions = lazy(() =>
  import("@/pages/Transactions").then((m) => ({ default: m.Transactions }))
)
const Budgets = lazy(() =>
  import("@/pages/Budgets").then((m) => ({ default: m.Budgets }))
)
const Investments = lazy(() =>
  import("@/pages/Investments").then((m) => ({ default: m.Investments }))
)
const Reports = lazy(() =>
  import("@/pages/Reports").then((m) => ({ default: m.Reports }))
)
const Forecast = lazy(() =>
  import("@/pages/Forecast").then((m) => ({ default: m.Forecast }))
)

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "transactions", element: <Transactions /> },
      { path: "budgets", element: <Budgets /> },
      { path: "forecast", element: <Forecast /> },
      { path: "reports", element: <Reports /> },
      { path: "investments", element: <Investments /> },
      // Telas que moravam na sidebar e agora vivem no dialog de Ajustes
      {
        path: "open-finance",
        element: <Navigate to="/?settings=open-finance" replace />,
      },
      { path: "rules", element: <Navigate to="/?settings=rules" replace /> },
      {
        path: "categories",
        element: <Navigate to="/?settings=categories" replace />,
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}

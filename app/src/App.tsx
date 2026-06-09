import { lazy } from "react"
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom"

import { AppLayout } from "@/components/layout/AppLayout"

// Cada página é carregada sob demanda (code-splitting por rota).
// Componentes pesados (ex.: gráficos do Dashboard) só baixam quando acessados.
const Home = lazy(() =>
  import("@/pages/Home").then((m) => ({ default: m.Home }))
)
const Clients = lazy(() =>
  import("@/pages/Clients").then((m) => ({ default: m.Clients }))
)
const Funnel = lazy(() =>
  import("@/pages/Funnel").then((m) => ({ default: m.Funnel }))
)
const Dashboard = lazy(() =>
  import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard }))
)

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "clients", element: <Clients /> },
      { path: "funnel", element: <Funnel /> },
      { path: "dashboard", element: <Dashboard /> },
      // /reports foi unificado ao dashboard
      { path: "reports", element: <Navigate to="/dashboard" replace /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}

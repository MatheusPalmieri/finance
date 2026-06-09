import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom"

import { AppLayout } from "@/components/layout/AppLayout"
import { Home } from "@/pages/Home"
import { Clients } from "@/pages/Clients"
import { Funnel } from "@/pages/Funnel"
import { Dashboard } from "@/pages/Dashboard"

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

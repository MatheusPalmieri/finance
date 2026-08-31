import { lazy } from "react"
import { createBrowserRouter, RouterProvider } from "react-router-dom"

import { AppLayout } from "@/components/layout/AppLayout"

const Home = lazy(() => import("@/pages/Home").then((m) => ({ default: m.Home })))
const Transactions = lazy(() =>
  import("@/pages/Transactions").then((m) => ({ default: m.Transactions }))
)
const Accounts = lazy(() =>
  import("@/pages/Accounts").then((m) => ({ default: m.Accounts }))
)
const Budgets = lazy(() =>
  import("@/pages/Budgets").then((m) => ({ default: m.Budgets }))
)
const Categories = lazy(() =>
  import("@/pages/Categories").then((m) => ({ default: m.Categories }))
)
const OpenFinance = lazy(() =>
  import("@/pages/OpenFinance").then((m) => ({ default: m.OpenFinance }))
)

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "transactions", element: <Transactions /> },
      { path: "accounts", element: <Accounts /> },
      { path: "budgets", element: <Budgets /> },
      { path: "categories", element: <Categories /> },
      { path: "open-finance", element: <OpenFinance /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}

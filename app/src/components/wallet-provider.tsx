import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

const STORAGE_KEY = "active-wallet-id"

interface WalletContextValue {
  /** Carteira ativa — `null` significa "todas as carteiras" */
  walletId: string | null
  setWalletId: (id: string | null) => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [walletId, setWalletIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY) || null
  )

  const setWalletId = useCallback((id: string | null) => {
    setWalletIdState(id)
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  }, [])

  const value = useMemo(
    () => ({ walletId, setWalletId }),
    [walletId, setWalletId]
  )

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useActiveWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx)
    throw new Error("useActiveWallet precisa estar dentro de <WalletProvider>")
  return ctx
}

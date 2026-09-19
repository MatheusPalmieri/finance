import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import { useWallets } from "@/lib/queries"

const STORAGE_KEY = "active-wallet-id"

interface WalletContextValue {
  /** Carteira ativa — só é `null` enquanto não existe nenhuma carteira cadastrada */
  walletId: string | null
  setWalletId: (id: string) => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { data: wallets } = useWallets()
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY)
  )

  // Sempre tem que haver uma carteira ativa. Se a escolha salva não existe mais
  // (excluída) ou nunca houve escolha, cai para a primeira da lista. Derivado no
  // render em vez de effect para não haver um instante sem carteira.
  // Enquanto a lista carrega, mantém a escolha salva (quase sempre válida).
  const walletId = wallets
    ? (wallets.find((w) => w.id === selectedId)?.id ?? wallets[0]?.id) || null
    : selectedId

  const setWalletId = useCallback((id: string) => {
    setSelectedId(id)
    localStorage.setItem(STORAGE_KEY, id)
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

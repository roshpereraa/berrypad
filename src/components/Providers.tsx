'use client'

import { useMemo, type ReactNode } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { RPC_URL, WS_URL } from '@/lib/sol/config'
import '@solana/wallet-adapter-react-ui/styles.css'

/**
 * Wallets are discovered through the Wallet Standard, so Phantom, Solflare,
 * Backpack and any other standard wallet appear without being bundled here.
 */
export function Providers({ children }: { children: ReactNode }) {
  const config = useMemo(() => ({ commitment: 'confirmed' as const, wsEndpoint: WS_URL }), [])
  return (
    <ConnectionProvider endpoint={RPC_URL} config={config}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

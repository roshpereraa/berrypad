'use client'

/**
 * wagmi configuration.
 *
 * Chain and RPC details come from the chain adapter's config module - project
 * rule 9 means they are not restated here.
 *
 * Injected wallets only (MetaMask, Rabby, Brave). WalletConnect is not wired
 * up: importing its connector pulls @walletconnect/ethereum-provider, an
 * optional peer that is not installed, which builds locally with a warning and
 * fails outright on a clean CI install. Adding it back means adding the
 * dependency, not just the import.
 */
import { createConfig, http, fallback } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { RPC_URLS, robinhoodChain } from '@/chain-adapter'
import type { Transport } from 'viem'

const transport: Transport = fallback(
  RPC_URLS.map((url) => http(url, { timeout: 20_000, retryCount: 2 })),
  { rank: false },
)

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [robinhoodChain.id]: transport },
  // Rendered on the server first; wagmi needs to know so it does not assume a
  // browser during the initial pass.
  ssr: true,
})

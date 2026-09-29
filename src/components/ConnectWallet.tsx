'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { ROBINHOOD_CHAIN_ID } from '@/chain-adapter'

/**
 * Connect button with an explicit wrong-network state.
 *
 * Project rule 2: the app refuses to build or send a transaction anywhere but
 * Robinhood Chain. This is the visible half of that; the hooks enforce it again
 * before anything is signed.
 */
export function ConnectWallet() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted
        const connected = ready && account && chain

        if (!ready) {
          return <div className="shimmer h-8 w-28 rounded-full" />
        }
        if (!connected) {
          return (
            <button
              onClick={openConnectModal}
              type="button"
              className="btn-primary px-4 py-1.5 text-sm"
            >
              Connect wallet
            </button>
          )
        }
        if (chain.unsupported || chain.id !== ROBINHOOD_CHAIN_ID) {
          return (
            <button
              onClick={openChainModal}
              type="button"
              className="rounded-full border border-[var(--color-down)]/50 bg-[var(--color-down)]/15 px-4 py-1.5 text-sm font-medium text-[var(--color-down)] hover:bg-[var(--color-down)]/25"
            >
              Wrong network — switch
            </button>
          )
        }
        return (
          <button
            onClick={openAccountModal}
            type="button"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:border-neutral-500 dark:border-neutral-700"
          >
            {account.displayName}
          </button>
        )
      }}
    </ConnectButton.Custom>
  )
}

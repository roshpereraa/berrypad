'use client'

import { useState } from 'react'
import { explorerAddress } from '@/chain-adapter'

/**
 * The project's own token.
 *
 * Deliberately empty until the address has been checked on chain: a contract
 * address is the one string on a site people copy and act on without reading.
 * Set NEXT_PUBLIC_BERRYPAD_CA on the deployment once it is verified; until
 * then the slot reads "not launched" rather than guessing.
 */
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_BERRYPAD_CA ?? '').trim()

const VALID = /^0x[0-9a-fA-F]{40}$/

export function ContractAddress({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const address = CONTRACT_ADDRESS

  if (!VALID.test(address)) {
    return (
      <span className={`label ${compact ? '' : 'block'}`} title="No token address is configured">
        CA · not launched
      </span>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard access can be refused; the address stays selectable either way.
    }
  }

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={copy}
        className="pill num px-2.5 py-1 text-[11px]"
        title={`Copy ${address}`}
        aria-label={`Copy contract address ${address}`}
      >
        CA {copied ? '· copied' : short}
      </button>
      {compact ? null : (
        <a
          href={explorerAddress(address)}
          target="_blank"
          rel="noopener noreferrer"
          className="label hover:text-[var(--accent-hi)]"
        >
          Explorer ↗
        </a>
      )}
    </span>
  )
}

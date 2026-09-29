'use client'

import { useState } from 'react'
import { getAddress } from 'viem'
import { explorerAddress } from '@/chain-adapter'
import { BERRYPAD_CA } from '@/lib/token'

/**
 * The Berrypad token address, validated and checksummed once at load.
 *
 * getAddress rejects a malformed or mis-checksummed address outright, so a
 * typo can never render as something copyable.
 */
export const CONTRACT_ADDRESS: string | null = (() => {
  const raw = BERRYPAD_CA.trim()
  if (!raw) return null
  try {
    return getAddress(raw)
  } catch {
    console.error('BERRYPAD_CA is not a valid address:', raw)
    return null
  }
})()

function useCopy(text: string) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard access can be refused; the address stays selectable either way.
    }
  }
  return { copied, copy }
}

/**
 * The prominent version for the hero: the full address, a copy button and an
 * explorer link. Renders nothing until the token is live.
 */
export function ContractAddressHero() {
  const { copied, copy } = useCopy(CONTRACT_ADDRESS ?? '')
  if (!CONTRACT_ADDRESS) return null
  return (
    <div className="mt-6 flex max-w-xl flex-wrap items-center gap-2 rounded-2xl border border-[var(--accent)]/40 bg-black/60 p-2 pl-4 backdrop-blur">
      <span className="label !text-[var(--accent)]">CA</span>
      <span className="num min-w-0 flex-1 text-[13px] [overflow-wrap:anywhere] select-all">{CONTRACT_ADDRESS}</span>
      <button onClick={copy} className="btn-primary shrink-0 px-4 py-1.5 text-xs" aria-label="Copy contract address">
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      <a
        href={explorerAddress(CONTRACT_ADDRESS)}
        target="_blank"
        rel="noopener noreferrer"
        className="pill shrink-0 px-3 py-1.5 text-xs"
      >
        Explorer ↗
      </a>
    </div>
  )
}

export function ContractAddress({ compact = false }: { compact?: boolean }) {
  const address = CONTRACT_ADDRESS
  const { copied, copy } = useCopy(address ?? '')

  if (!address) {
    return (
      <span className={`label ${compact ? '' : 'block'}`} title="The token is not live yet">
        CA · coming soon
      </span>
    )
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

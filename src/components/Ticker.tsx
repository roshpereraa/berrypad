'use client'

import Link from 'next/link'
import type { Coin } from '@/lib/sol/feed'
import { usd } from '@/lib/sol/format'

/** The rail under the header: the busiest coins right now, by volume seen. */
export function Ticker({ coins, solPrice }: { coins: Coin[]; solPrice: number | null }) {
  if (coins.length === 0) {
    return (
      <div className="rail">
        <div className="px-4 py-2.5"><div className="shimmer h-3 w-full rounded" /></div>
      </div>
    )
  }
  const run = [...coins, ...coins]
  return (
    <div className="rail">
      <div className="rail-track">
        {run.map((c, i) => (
          <Link
            key={`${c.mint}-${i}`}
            href={`/token?address=${c.mint}`}
            className="group inline-flex shrink-0 items-center gap-2 text-xs"
            aria-hidden={i >= coins.length}
            tabIndex={i >= coins.length ? -1 : undefined}
          >
            <span className="font-semibold group-hover:text-[var(--accent-hi)]">${c.symbol || '…'}</span>
            <span className="num text-[var(--muted)]">
              {solPrice ? usd(c.marketCapSol * solPrice) : `${c.marketCapSol.toFixed(1)} SOL`}
            </span>
            <span className={`num ${c.progress >= 50 ? 'text-[var(--up)]' : 'text-[var(--faint)]'}`}>
              {c.complete ? 'graduated' : `${c.progress.toFixed(0)}%`}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

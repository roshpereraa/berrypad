'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import type { Coin } from '@/lib/sol/feed'
import { ensureMetadata } from '@/lib/sol/feed'
import { formatSol, shortAddress, timeAgo, usd } from '@/lib/sol/format'
import { TokenLogo } from './TokenLogo'

/** One coin in a board column: art, name, age, market cap and curve progress. */
export function CoinRow({ coin, solPrice, fresh = false }: { coin: Coin; solPrice: number | null; fresh?: boolean }) {
  useEffect(() => {
    ensureMetadata(coin.mint)
  }, [coin.mint])

  const mcap = solPrice ? coin.marketCapSol * solPrice : null
  const age = coin.createdAt ? timeAgo(coin.createdAt) : null
  const total = coin.buys + coin.sells

  return (
    <Link
      href={`/token?address=${coin.mint}`}
      className={`card-hover group flex gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]/60 p-3 ${fresh ? 'flash-in' : ''}`}
    >
      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-3)]">
        <TokenLogo logo={coin.image} symbol={coin.symbol || coin.mint} fill />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold group-hover:text-[var(--accent-hi)]">
            {coin.name || (coin.enriched ? shortAddress(coin.mint) : <span className="shimmer inline-block h-3.5 w-24 rounded align-middle" />)}
          </span>
          {coin.holderReward ? (
            <span className="chip tag-gold !px-1.5 !py-0 text-[10px]" title="Creator fees go to holders">
              holders
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="font-medium text-[var(--text)]/80">${coin.symbol || '…'}</span>
          {age ? <span className="num">{age}</span> : null}
          <span className="num">{total} tx</span>
          {coin.volumeSol > 0n ? <span className="num">{formatSol(coin.volumeSol, 2)} SOL vol</span> : null}
        </span>
        <span className="mt-2 flex items-center gap-2">
          <span className="meter meter-thin flex-1">
            <span style={{ width: `${Math.max(coin.progress, 1.5)}%` }} />
          </span>
          <span className={`num w-11 text-right text-[11px] ${coin.complete ? 'text-[var(--up)]' : 'text-[var(--muted)]'}`}>
            {coin.complete ? 'done' : `${coin.progress.toFixed(0)}%`}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="label block">MC</span>
        <span className="num block text-sm font-semibold">
          {mcap !== null ? usd(mcap) : `${coin.marketCapSol.toFixed(1)} SOL`}
        </span>
      </span>
    </Link>
  )
}

export function CoinRowSkeleton() {
  return (
    <div className="flex gap-3 rounded-2xl border border-[var(--line)] p-3">
      <div className="shimmer h-14 w-14 rounded-xl" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="shimmer h-3.5 w-1/2 rounded" />
        <div className="shimmer h-3 w-1/3 rounded" />
        <div className="shimmer h-1.5 w-full rounded" />
      </div>
    </div>
  )
}

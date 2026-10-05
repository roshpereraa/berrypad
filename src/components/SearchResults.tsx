'use client'

import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useFeed } from '@/lib/sol/useFeed'
import { useSolUsd } from '@/lib/sol/useSolUsd'
import { CoinRow } from './CoinRow'
import { SearchBox } from './SearchBox'

/**
 * Name and ticker search over the coins this tab has seen live. There is no
 * index behind the site, so a coin outside that window is found by pasting
 * its address instead, which always works.
 */
export function SearchResults() {
  const q = (useSearchParams().get('q') ?? '').trim().toLowerCase()
  const feed = useFeed()
  const solPrice = useSolUsd()
  const results = useMemo(
    () =>
      q
        ? [...feed.coins.values()]
            .filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q))
            .sort((a, b) => b.marketCapSol - a.marketCapSol)
            .slice(0, 60)
        : [],
    [feed, q],
  )

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="display text-3xl">Search</h1>
      <div className="mt-4 md:hidden">
        <SearchBox autoFocus />
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">
        {q ? `${results.length} coin${results.length === 1 ? '' : 's'} matching “${q}” among the ${feed.coins.size} seen live.` : 'Type a name, ticker or address.'}{' '}
        Paste a mint address to open any pump.fun coin.
      </p>
      <div className="mt-6 space-y-2">
        {results.map((c) => (
          <CoinRow key={c.mint} coin={c} solPrice={solPrice} />
        ))}
      </div>
    </div>
  )
}

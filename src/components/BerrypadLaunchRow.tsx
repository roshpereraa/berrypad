'use client'

import Link from 'next/link'
import type { BerrypadLaunch } from '@/lib/sol/launches'
import { shortAddress, timeAgo } from '@/lib/sol/format'
import { TokenLogo } from './TokenLogo'

/**
 * One of our own launches, as read from the launch registry.
 *
 * This is the row for a coin the live feed has not seen trade yet: the
 * registry knows it exists and who made it, but a coin only gets reserves, a
 * market cap and curve progress once a fill comes through. Rather than show
 * zeroes that look like a dead coin, it shows what is actually known and says
 * the rest is waiting. A coin that is trading gets the full CoinRow instead.
 */
export function BerrypadLaunchRow({ launch }: { launch: BerrypadLaunch }) {
  const age = launch.timestamp ? timeAgo(launch.timestamp) : null
  return (
    <Link
      href={`/token?address=${launch.mint}`}
      className="card-hover group flex gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]/60 p-3"
    >
      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-3)]">
        <TokenLogo logo={launch.image} symbol={launch.symbol || launch.mint} fill />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold group-hover:text-[var(--accent-hi)]">
            {launch.name || shortAddress(launch.mint)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="font-medium text-[var(--text)]/80">${launch.symbol || '…'}</span>
          {age ? <span className="num">{age}</span> : null}
        </span>
        <span className="mt-2 flex items-center gap-2 text-[11px] text-[var(--faint)]">
          <span className="chip tag-accent !px-1.5 !py-0 text-[10px]">launched here</span>
          <span className="num truncate">by {shortAddress(launch.creator)}</span>
        </span>
      </span>
    </Link>
  )
}

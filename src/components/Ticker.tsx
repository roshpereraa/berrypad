'use client'

import Link from 'next/link'
import { formatAmount } from '@/chain-adapter'
import type { ChainToken } from '@/lib/chain'

/**
 * The rail under the nav.
 *
 * It shows progress to graduation and the amount raised, because those are
 * what the chain actually gives us for a curve. A 24h price change would be
 * the obvious thing to run here, and it is exactly what this cannot honestly
 * show: a bonding curve has no candles, and nothing is indexed to diff
 * against. Better a real number than a plausible one.
 *
 * The list is rendered twice so the marquee can translate half its width and
 * land back where it started, with no visible seam.
 */
export function Ticker({ tokens }: { tokens: ChainToken[] | null }) {
  if (!tokens || tokens.length === 0) {
    return (
      <div className="rail">
        <div className="mx-auto max-w-[1400px] px-4 py-2">
          <div className="shimmer h-4 w-full rounded" />
        </div>
      </div>
    )
  }

  const run = [...tokens, ...tokens]

  return (
    <div className="rail">
      <div className="rail-track">
        {run.map((t, i) => {
          const pct = progress(t.raised, t.threshold)
          return (
            <Link
              key={`${t.address}-${i}`}
              href={`/token?address=${t.address}`}
              className="group inline-flex shrink-0 items-center gap-2 text-[11px]"
              // The second copy is decoration; a screen reader reads the list once.
              aria-hidden={i >= tokens.length}
              tabIndex={i >= tokens.length ? -1 : undefined}
            >
              <span className="font-semibold text-[var(--color-ink)] group-hover:text-[var(--accent-hi)]">
                ${t.symbol || '???'}
              </span>
              <span className="num text-[var(--color-muted)]">
                {Number(formatAmount(t.raised, t.quoteDecimals)).toFixed(3)} {t.quoteSymbol}
              </span>
              <span className={`num ${pct >= 1 ? 'chip-up' : 'text-[var(--color-muted)]'}`}>
                {pct.toFixed(1)}%
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function progress(raised: bigint, threshold: bigint): number {
  if (threshold <= 0n) return 0
  const bps = (raised * 10_000n) / threshold
  return Math.min(Number(bps > 10_000n ? 10_000n : bps) / 100, 100)
}

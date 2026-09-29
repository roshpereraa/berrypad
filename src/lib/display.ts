/**
 * Display helpers for the explore UI.
 *
 * This is the layer where decimals get applied (project rule 6). Everything
 * upstream - the adapter, the queries, the database - keeps raw integers.
 */
import {
  formatAmount,
  formatProgress,
  formatSignificant,
  resolveLogoUrl,
  resolveLogoUrls,
  shortAddress,
} from '@/chain-adapter'
import type { TokenSummary } from '@/lib/types'

export { shortAddress, formatProgress, resolveLogoUrl, resolveLogoUrls }

/**
 * A quote amount in its launch's own asset, with the right decimals.
 *
 * Falls back to significant digits when four decimal places would round a real,
 * non-zero amount down to "0" - which happens constantly with dust-sized trades.
 */
export function formatQuote(
  amount: bigint | null,
  token: Pick<TokenSummary, 'quoteDecimals' | 'quoteSymbol'>,
): string {
  if (amount === null) return '—'
  const decimals = token.quoteDecimals ?? 18
  const symbol = token.quoteSymbol ?? '?'
  const fixed = formatAmount(amount, decimals, 4)
  const text = amount !== 0n && fixed === '0' ? formatSignificant(amount, decimals, 2) : fixed
  return `${text} ${symbol}`
}

/** A price, which for a memecoin is routinely ~1e-8 of the quote asset. */
export function formatPrice(
  amount: bigint | null,
  token: Pick<TokenSummary, 'quoteDecimals' | 'quoteSymbol'>,
): string {
  if (amount === null) return '—'
  return `${formatSignificant(amount, token.quoteDecimals ?? 18, 4)} ${token.quoteSymbol ?? '?'}`
}

/** Compact form for table cells: 1.2M, 12.3k, 0.0042. */
export function formatCompact(amount: bigint | null, decimals: number): string {
  if (amount === null) return '—'
  const whole = amount / 10n ** BigInt(decimals)
  if (whole >= 1_000_000_000n) return `${formatAmount(amount, decimals + 9, 2)}B`
  if (whole >= 1_000_000n) return `${formatAmount(amount, decimals + 6, 2)}M`
  if (whole >= 1_000n) return `${formatAmount(amount, decimals + 3, 2)}k`
  return formatAmount(amount, decimals, 4)
}

export function formatCompactQuote(
  amount: bigint | null,
  token: Pick<TokenSummary, 'quoteDecimals' | 'quoteSymbol'>,
): string {
  if (amount === null) return '—'
  return `${formatCompact(amount, token.quoteDecimals ?? 18)} ${token.quoteSymbol ?? '?'}`
}

/** "3m ago", "2h ago". Returns null when the timestamp is unknown. */
export function timeAgo(iso: string | null): string | null {
  if (!iso) return null
  const then = new Date(iso.replace(' ', 'T').replace('+00', 'Z')).getTime()
  if (Number.isNaN(then)) return null
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

/** Graduation progress as a 0-100 number, for bar widths only. */
export function progressPercent(raised: bigint | null, threshold: bigint | null): number {
  if (!raised || !threshold || threshold <= 0n) return 0
  const bps = (raised * 10_000n) / threshold
  const clamped = bps > 10_000n ? 10_000n : bps < 0n ? 0n : bps
  return Number(clamped) / 100
}

export function phaseLabel(phase: string): { label: string; className: string } {
  switch (phase) {
    case 'pool_created':
      return {
        label: 'Graduated',
        className: 'bg-[rgba(25,217,143,0.14)] text-[var(--color-accent)]',
      }
    case 'swept':
      return {
        label: 'Graduating',
        className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
      }
    case 'rescued':
      return {
        label: 'Rescued',
        className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
      }
    default:
      return {
        label: 'On curve',
        className: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
      }
  }
}

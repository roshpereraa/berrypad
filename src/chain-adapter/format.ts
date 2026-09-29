/**
 * Display helpers.
 *
 * Project rule 6: raw on-chain integers stay bigint everywhere else. This is
 * the only module that applies decimals, and nothing here feeds back into a
 * calculation - these outputs are strings for rendering.
 */
import { formatUnits } from 'viem'

/** Formats a raw amount with a sensible number of significant digits. */
export function formatAmount(raw: bigint, decimals: number, maxFractionDigits = 6): string {
  const full = formatUnits(raw, decimals)
  const [whole, fraction] = full.split('.')
  if (!fraction) return whole!
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : whole!
}

/** Formats an ETH amount (18 decimals). */
export function formatEth(raw: bigint, maxFractionDigits = 6): string {
  return formatAmount(raw, 18, maxFractionDigits)
}

/** Basis points as a percentage string, e.g. 100n -> "1%". */
export function formatBps(bps: bigint): string {
  const whole = bps / 100n
  const remainder = bps % 100n
  if (remainder === 0n) return `${whole}%`
  return `${whole}.${remainder.toString().padStart(2, '0').replace(/0+$/, '')}%`
}

/**
 * Graduation progress as a percentage string, computed in bigint then rendered.
 * Clamped to 100 so a threshold overshoot does not display as 103%.
 */
export function formatProgress(raised: bigint, threshold: bigint): string {
  if (threshold <= 0n) return '0.0%'
  const basisPoints = (raised * 10_000n) / threshold
  const clamped = basisPoints > 10_000n ? 10_000n : basisPoints
  const whole = clamped / 100n
  const tenths = (clamped % 100n) / 10n
  return `${whole}.${tenths}%`
}

/**
 * Formats a very small amount with a fixed number of SIGNIFICANT digits.
 *
 * A memecoin price is routinely around 1e-8 of the quote asset, which any
 * fixed-decimal formatter renders as a flat "0". This keeps the leading
 * significant digits wherever the value happens to sit.
 */
export function formatSignificant(raw: bigint, decimals: number, significant = 4): string {
  if (raw === 0n) return '0'
  const negative = raw < 0n
  const value = negative ? -raw : raw
  const scale = 10n ** BigInt(decimals)
  const sign = negative ? '-' : ''

  if (value >= scale) return sign + formatAmount(value, decimals, significant)

  // Below 1: find how many leading zeros the fraction has, then keep
  // `significant` digits after them.
  let zeros = 0
  let probe = value * 10n
  while (probe < scale && zeros < 40) {
    zeros++
    probe *= 10n
  }
  const digits = formatUnits(value, decimals).split('.')[1] ?? ''
  const kept = digits.slice(0, zeros + significant).replace(/0+$/, '')
  return kept ? `${sign}0.${kept}` : '0'
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/**
 * IPFS gateways, in preference order.
 *
 * Measured 2026-09-24: ipfs.io, w3s.link, nftstorage.link and dweb.link all
 * return 429 (rate limited) for anonymous traffic, and cloudflare-ipfs.com no
 * longer resolves at all. Hard-coding any single gateway therefore breaks most
 * token art; callers walk this list and fall through on error.
 */
export const IPFS_GATEWAYS = [
  'https://ipfs.filebase.io/ipfs/',
  'https://4everland.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
] as const

/** A bare CIDv1 (base32) or CIDv0, as stored by some launches with no scheme. */
const BARE_CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})(\/.*)?$/

/**
 * Every URL worth trying for a token's logo, best first.
 *
 * Returns a list rather than one URL because a single gateway cannot be
 * trusted: the UI tries the next on error. An empty list means there is
 * nothing renderable and the caller should fall back to initials.
 */
export function resolveLogoUrls(logo: string | null | undefined): string[] {
  if (!logo) return []
  const raw = logo.trim()
  if (!raw) return []

  if (raw.startsWith('ipfs://')) {
    const path = raw.slice('ipfs://'.length).replace(/^ipfs\//, '')
    return IPFS_GATEWAYS.map((g) => g + path)
  }
  // Some launches store the CID with no scheme at all.
  if (BARE_CID.test(raw)) {
    return IPFS_GATEWAYS.map((g) => g + raw)
  }
  if (raw.startsWith('https://')) return [raw]
  // Plain http is upgraded: a mixed-content image is blocked by the browser.
  if (raw.startsWith('http://')) return ['https://' + raw.slice('http://'.length)]
  return []
}

/** First candidate only, for callers that cannot retry (metadata, previews). */
export function resolveLogoUrl(
  logo: string | null | undefined,
  gateway = IPFS_GATEWAYS[0],
): string | null {
  const urls = resolveLogoUrls(logo)
  if (urls.length === 0) return null
  if (gateway !== IPFS_GATEWAYS[0] && urls[0]!.includes('/ipfs/')) {
    return gateway + urls[0]!.split('/ipfs/')[1]
  }
  return urls[0]!
}

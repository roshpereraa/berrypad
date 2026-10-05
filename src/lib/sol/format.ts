/**
 * Display helpers. Raw amounts stay bigint everywhere else; this is the only
 * place decimals are applied, and nothing here feeds back into a calculation.
 */

/** A raw integer amount as a decimal string, trimmed. */
export function formatUnits(raw: bigint, decimals: number): string {
  const negative = raw < 0n
  const value = negative ? -raw : raw
  const scale = 10n ** BigInt(decimals)
  const whole = value / scale
  const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

/** Parses a decimal string into a raw integer. Returns null when invalid. */
export function parseUnits(text: string, decimals: number): bigint | null {
  const t = text.trim()
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null
  const [whole = '0', fraction = ''] = t.split('.')
  if (fraction.length > decimals) return null
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
}

export function formatAmount(raw: bigint, decimals: number, maxFractionDigits = 4): string {
  const full = formatUnits(raw, decimals)
  const [whole, fraction] = full.split('.')
  if (!fraction) return whole!
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, '')
  if (!trimmed && raw !== 0n) return formatSignificant(raw, decimals, 2)
  return trimmed ? `${whole}.${trimmed}` : whole!
}

/** Keeps leading significant digits for tiny values such as memecoin prices. */
export function formatSignificant(raw: bigint, decimals: number, significant = 4): string {
  if (raw === 0n) return '0'
  const n = Number(formatUnits(raw, decimals))
  if (!Number.isFinite(n)) return formatUnits(raw, decimals)
  return n.toLocaleString('en-US', { maximumSignificantDigits: significant })
}

export const formatSol = (lamports: bigint, digits = 3) => formatAmount(lamports, 9, digits)

/** Compact human number: 1.2K, 3.4M. */
export function compact(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—'
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: digits }).format(n)
}

/** Dollar figure, compact above a thousand. */
export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (n >= 1000) return `$${compact(n, n >= 1e6 ? 2 : 1)}`
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

export function formatBps(bps: number | bigint): string {
  const n = Number(bps) / 100
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
}

export function shortAddress(address: string, head = 4, tail = 4): string {
  if (address.length <= head + tail + 1) return address
  return `${address.slice(0, head)}…${address.slice(-tail)}`
}

export function timeAgo(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return ''
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/**
 * IPFS gateways, best first. pump.fun hands out ipfs.io URLs, and ipfs.io
 * rate-limits anonymous traffic, so every IPFS reference is rewritten onto
 * this list and the UI walks it on error.
 */
export const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.filebase.io/ipfs/',
  'https://dweb.link/ipfs/',
] as const

const BARE_CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})(\/.*)?$/

export function resolveImageUrls(uri: string | null | undefined): string[] {
  if (!uri) return []
  const raw = uri.trim()
  if (!raw) return []
  let path: string | null = null
  if (raw.startsWith('ipfs://')) path = raw.slice(7).replace(/^ipfs\//, '')
  else if (BARE_CID.test(raw)) path = raw
  else {
    const m = raw.match(/^https?:\/\/[^/]+\/ipfs\/(.+)$/)
    if (m) path = m[1]!
  }
  if (path) return IPFS_GATEWAYS.map((g) => g + path)
  if (raw.startsWith('https://')) return [raw]
  if (raw.startsWith('http://')) return ['https://' + raw.slice(7)]
  return []
}

/**
 * Whether a string is a plausible Solana address.
 *
 * Base58 excludes 0, O, I and l so the alphabet below is deliberate rather
 * than a typo, and a check here keeps a pasted EVM address or a truncated
 * mint from reaching the RPC as a malformed account query.
 */
export function isSolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)
}

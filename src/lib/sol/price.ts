/** Dollar prices for display only. Plain fetch, no Solana libraries. */

async function fetchJson(url: string, ms: number): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(String(res.status))
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ */
/* SOL / USD                                                           */
/* ------------------------------------------------------------------ */

const PYTH_SOL_USD = 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'
let solCache: { at: number; value: Promise<number | null> } | null = null

/**
 * SOL in dollars, for display only. Read from Pyth's public price service,
 * with Coinbase as a fallback. Nothing is ever priced or signed off this.
 */
export function solUsd(): Promise<number | null> {
  if (!solCache || Date.now() - solCache.at > 60_000) {
    const value = (async () => {
      try {
        const data = (await fetchJson(
          `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_SOL_USD}&parsed=true`,
          5_000,
        )) as { parsed?: { price: { price: string; expo: number } }[] }
        const p = data.parsed?.[0]?.price
        if (p) return Number(p.price) * 10 ** p.expo
      } catch {
        /* fall through */
      }
      try {
        const data = (await fetchJson('https://api.coinbase.com/v2/prices/SOL-USD/spot', 5_000)) as {
          data?: { amount?: string }
        }
        const n = Number(data.data?.amount)
        return Number.isFinite(n) && n > 0 ? n : null
      } catch {
        return null
      }
    })()
    solCache = { at: Date.now(), value }
  }
  return solCache.value
}

const tokenUsdCache = new Map<string, { at: number; value: Promise<number | null> }>()

/**
 * A token's dollar price for display, from Jupiter's public price API. Null
 * when unknown; the page then shows amounts in the token itself.
 */
export function tokenUsd(mint: string): Promise<number | null> {
  const hit = tokenUsdCache.get(mint)
  if (hit && Date.now() - hit.at < 60_000) return hit.value
  const value = (async () => {
    try {
      const data = (await fetchJson(`https://lite-api.jup.ag/price/v3?ids=${mint}`, 5_000)) as Record<
        string,
        { usdPrice?: number } | undefined
      >
      const p = data[mint]?.usdPrice
      return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null
    } catch {
      return null
    }
  })()
  tokenUsdCache.set(mint, { at: Date.now(), value })
  return value
}

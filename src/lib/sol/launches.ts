'use client'

/**
 * The coins launched through Berrypad.
 *
 * Every launch made on this site sends a 0 SOL marker to
 * BERRYPAD_LAUNCH_REGISTRY, so the list of our own launches is just that
 * address's transactions, decoded. No database, no server, no list anyone has
 * to maintain by hand: a coin appears here because the chain says Berrypad
 * launched it, and it cannot be faked, because the registry address has no
 * key and nothing else sends to it.
 *
 * It is not an index. This is the newest few hundred transactions on the
 * registry, which is every Berrypad launch until the site is busy enough for
 * that to stop being true - and the column says as much.
 */
import { useEffect, useState } from 'react'
import { readCache, writeCache } from '../cache'
import { BERRYPAD_LAUNCH_REGISTRY } from './config'
import { eventsForAddress } from './history'
import type { LaunchEvent } from './events'
import { fetchUriMetadata } from './metadata'

/** One of our launches, as the home-page column needs it. */
export interface BerrypadLaunch {
  mint: string
  name: string
  symbol: string
  creator: string
  /** Seconds since the epoch, from the block the launch landed in. */
  timestamp: number
  sig: string
  /** The metadata JSON, which is where the artwork lives. */
  uri: string
  /** Resolved from that JSON. Empty until it lands, or if it never does. */
  image: string
}

const CACHE_KEY = 'berrypad.launches.v1'
/** Long enough that moving between pages costs nothing, short enough to feel live. */
const FRESH_MS = 60_000
/** How many registry transactions to read. Each launch is one. */
const SCAN = 200

/**
 * Read the registry's recent transactions and keep the launch events.
 *
 * A launch transaction carries exactly one CreateEvent, but it is read
 * defensively: a mint is kept once, and the newest wins.
 */
export async function fetchBerrypadLaunches(limit = 24): Promise<BerrypadLaunch[]> {
  const events = await eventsForAddress(BERRYPAD_LAUNCH_REGISTRY, SCAN)
  const seen = new Map<string, BerrypadLaunch>()
  for (const e of events.filter((e): e is LaunchEvent => e.kind === 'launch')) {
    if (seen.has(e.mint)) continue
    seen.set(e.mint, {
      mint: e.mint,
      name: e.name,
      symbol: e.symbol,
      creator: e.creator,
      timestamp: e.timestamp,
      sig: e.sig,
      uri: e.uri,
      image: '',
    })
  }
  return [...seen.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
}

/**
 * Fill in the artwork, which lives in the metadata JSON rather than on chain.
 *
 * Each URI is fetched at most once per session by fetchUriMetadata, and a
 * coin whose metadata will not load simply keeps its monogram.
 */
async function withImages(launches: BerrypadLaunch[]): Promise<BerrypadLaunch[]> {
  return Promise.all(
    launches.map(async (l) => {
      if (!l.uri) return l
      const meta = await fetchUriMetadata(l.uri).catch(() => null)
      return meta?.image ? { ...l, image: meta.image } : l
    }),
  )
}

export type LaunchesStatus = 'loading' | 'ready' | 'error'

/**
 * The column's data source.
 *
 * Shows whatever was cached straight away so the column never starts empty on
 * a repeat visit, then refreshes behind it. An RPC that refuses the read
 * leaves the cached list in place rather than blanking the column.
 */
export function useBerrypadLaunches(limit = 24): {
  launches: BerrypadLaunch[]
  status: LaunchesStatus
  error: string | null
} {
  /*
   * The cache is read in the effect, never during render. Reading it during
   * render makes the browser's first paint disagree with the server's HTML on
   * any repeat visit - the server has no storage and renders skeletons, the
   * browser has a cached list and renders rows - and React treats that
   * mismatch as a failed hydration, which takes the whole page down rather
   * than just this column.
   */
  const [launches, setLaunches] = useState<BerrypadLaunch[]>([])
  const [status, setStatus] = useState<LaunchesStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cached = readCache<BerrypadLaunch[]>(CACHE_KEY)
    if (cached) {
      setLaunches(cached.data)
      setStatus('ready')
      // A cache written moments ago is good enough; skip the round trip.
      if (Date.now() - cached.at < FRESH_MS) return
    }
    let live = true
    void (async () => {
      try {
        const base = await fetchBerrypadLaunches(limit)
        if (!live) return
        // Show the names first; the artwork follows a moment later.
        setLaunches(base)
        setStatus('ready')
        setError(null)

        const enriched = await withImages(base)
        if (!live) return
        setLaunches(enriched)
        writeCache(CACHE_KEY, enriched)
      } catch (err) {
        if (!live) return
        setError(err instanceof Error ? err.message : 'Could not read the launch registry')
        // Keep a cached list on screen; only an empty column becomes an error.
        setStatus((prev) => (prev === 'ready' ? 'ready' : 'error'))
      }
    })()
    return () => {
      live = false
    }
  }, [limit])

  return { launches, status, error }
}

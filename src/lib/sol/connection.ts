'use client'

import { Connection } from '@solana/web3.js'
import { RPC_URL, WS_URL } from './config'

let shared: Connection | null = null

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * fetch with a few quiet retries. A busy RPC answers 429 or 503 for a moment
 * and then recovers, so a read waits it out instead of failing in front of
 * someone.
 */
export const retryingFetch: typeof fetch = async (input, init) => {
  let last: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(input, init)
      if (res.status !== 429 && res.status !== 502 && res.status !== 503 && res.status !== 504) return res
      last = new Error(`${res.status} ${res.statusText}`)
      if (attempt === 3) return res
    } catch (e) {
      last = e
      if (attempt === 3) throw e
    }
    await pause(400 * 2 ** attempt + Math.random() * 250)
  }
  throw last
}

/** One connection per tab. Reads use `confirmed`: fresh, but not reorg bait. */
export function getConnection(): Connection {
  if (!shared) {
    shared = new Connection(RPC_URL, {
      commitment: 'confirmed',
      wsEndpoint: WS_URL,
      fetch: retryingFetch,
    })
  }
  return shared
}

/** Nothing may hang forever; a stuck read shows as an error instead. */
export function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms),
    ),
  ])
}

/** Turns RPC failures into a sentence someone can act on. */
export function describeRpcError(error: unknown): string {
  const text = String((error as Error)?.message ?? error)
  if (/429|503|Too Many Requests|rate limit|busy|403|forbidden/i.test(text)) {
    return 'Solana is busy right now. Give it a few seconds and try again.'
  }
  if (/failed to fetch|networkerror|load failed/i.test(text)) {
    return 'Could not reach Solana. Check your connection or any extension blocking requests.'
  }
  return text.split('\n')[0]!.slice(0, 280)
}

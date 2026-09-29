/**
 * viem chain definition and client construction for Robinhood Chain.
 *
 * All configuration comes from ./config - nothing is hard-coded here.
 */
import { createPublicClient, defineChain, fallback, http } from 'viem'
import type { PublicClient } from 'viem'
import { CHAIN_CONFIG, CONTRACTS, EXPLORER_URL, ROBINHOOD_CHAIN_ID, RPC_URLS } from './config.js'

export const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: CHAIN_CONFIG.name,
  nativeCurrency: CHAIN_CONFIG.nativeCurrency,
  rpcUrls: { default: { http: [...RPC_URLS] } },
  blockExplorers: { default: { name: 'Explorer', url: EXPLORER_URL } },
  contracts: { multicall3: { address: CONTRACTS.multicall3 } },
})

/**
 * A client that fails over across every configured RPC.
 *
 * `rank: false` keeps the configured order rather than reordering by latency,
 * so the primary endpoint stays primary and failover stays predictable.
 */
export function createRobinhoodClient(urls: readonly string[] = RPC_URLS): PublicClient {
  // JSON-RPC batching packs ~100 reads into one HTTP round trip, which is what
  // makes per-block timestamp resolution affordable during a backfill.
  const transports = urls.map((url) =>
    http(url, { timeout: 20_000, retryCount: 2, batch: { batchSize: 100, wait: 16 } }),
  )
  return createPublicClient({
    chain: robinhoodChain,
    transport: transports.length === 1 ? transports[0]! : fallback(transports, { rank: false }),
    batch: { multicall: { wait: 16 } },
  })
}

/**
 * Project rule 2: refuse to act on the wrong network.
 *
 * Call this before building or sending any transaction. It is deliberately a
 * throw rather than a boolean so a caller cannot forget to check the result.
 */
export function assertRobinhoodChain(chainId: number | undefined): asserts chainId is 4663 {
  if (chainId !== ROBINHOOD_CHAIN_ID) {
    throw new WrongChainError(chainId)
  }
}

export class WrongChainError extends Error {
  readonly expected = ROBINHOOD_CHAIN_ID
  constructor(readonly actual: number | undefined) {
    super(
      `Wrong network: expected Robinhood Chain (${ROBINHOOD_CHAIN_ID}) but the wallet is on ${
        actual ?? 'an unknown chain'
      }. Switch networks and try again.`,
    )
    this.name = 'WrongChainError'
  }
}

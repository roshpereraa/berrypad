/** A launch as the UI renders it (shape carried over from the indexer schema). */
export interface TokenSummary {
  address: string
  version: 'v1' | 'v2'
  name: string | null
  symbol: string | null
  decimals: number
  logo: string | null
  description: string | null
  socials: {
    twitter: string | null
    telegram: string | null
    discord: string | null
    website: string | null
    farcaster: string | null
  }
  totalSupply: bigint | null
  curve: string | null
  deployer: string
  /** Where the protocol pays this launch's creator fees. */
  creatorFeeRecipient: string | null
  /** Quote asset: zero address means native ETH. */
  pairToken: string
  quoteSymbol: string | null
  quoteDecimals: number | null
  isNativeQuote: boolean
  launchBlock: bigint
  launchedAt: string | null
  graduationThreshold: bigint | null
  phase: string
  graduatedAt: string | null
  /** realQuoteReserve read from the curve. Null until the indexer has synced it. */
  raised: bigint | null
  sellableTokens: bigint | null
  /** Marginal price from the most recent trade, in quote units per whole token. */
  lastPrice: bigint | null
  marketCap: bigint | null
  volume24h: bigint
  trades24h: number
  tradesTotal: number
}

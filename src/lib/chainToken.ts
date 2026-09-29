import 'server-only'
import type { Address } from 'viem'
import type { TokenSummary } from '@/lib/types'
import { NATIVE_QUOTE, LaunchpadV2Adapter, createRobinhoodClient, v2TokenAbi } from '@/chain-adapter'

/**
 * Reads a token straight from the chain, for launches the indexer has not seen.
 *
 * A coin is tradeable the moment its launch transaction confirms, but it only
 * reaches our database when the indexer next runs - and on a deployment where
 * the indexer is not running, that could be never. Without this, a creator is
 * redirected from the launch flow to a 404 for a token that demonstrably
 * exists. Trade counts and volume are absent because those come from indexed
 * history; everything else is authoritative because it is read live.
 */
export async function readTokenFromChain(address: string): Promise<TokenSummary | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null
  const client = createRobinhoodClient()
  const adapter = new LaunchpadV2Adapter(client)

  const record = await adapter.getLaunchedToken(address as Address).catch(() => null)
  if (!record) return null

  const [meta, curve] = await Promise.all([
    adapter.getTokenMetadata(address as Address).catch(() => null),
    adapter.getCurveState(address as Address).catch(() => null),
  ])
  if (!meta) return null

  const isNativeQuote = record.pairToken.toLowerCase() === NATIVE_QUOTE.toLowerCase()
  let quoteSymbol = 'ETH'
  let quoteDecimals = 18
  if (!isNativeQuote) {
    const [sym, dec] = await Promise.all([
      client.readContract({ address: record.pairToken, abi: v2TokenAbi, functionName: 'symbol' }).catch(() => '?'),
      client.readContract({ address: record.pairToken, abi: v2TokenAbi, functionName: 'decimals' }).catch(() => 18),
    ])
    quoteSymbol = sym as string
    quoteDecimals = Number(dec)
  }

  return {
    address: record.address.toLowerCase(),
    version: 'v2',
    name: meta.name,
    symbol: meta.symbol,
    decimals: meta.decimals,
    logo: meta.logo || null,
    description: meta.description || null,
    socials: meta.socials,
    totalSupply: meta.totalSupply,
    curve: record.curve,
    deployer: record.deployer,
    creatorFeeRecipient: record.creatorFeeRecipient,
    pairToken: record.pairToken,
    quoteSymbol,
    quoteDecimals,
    isNativeQuote,
    launchBlock: 0n,
    launchedAt: null,
    graduationThreshold: curve?.graduationThreshold ?? null,
    phase: curve?.graduated ? 'pool_created' : 'not_graduated',
    graduatedAt: null,
    raised: curve?.realQuoteReserve ?? null,
    sellableTokens: curve?.sellableTokens ?? null,
    // Derived from indexed trade history, which by definition we do not have.
    lastPrice: null,
    marketCap: null,
    volume24h: 0n,
    trades24h: 0,
    tradesTotal: 0,
  }
}

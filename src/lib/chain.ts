'use client'

/**
 * Backend-free data layer.
 *
 * Every figure on the site is read straight from Robinhood Chain in the
 * browser. There is no database, no indexer and no API: the chain is the only
 * source, which means the site can be served as static files from anywhere and
 * still show live data.
 *
 * The trade-off is honest and worth stating: without an index we can only see
 * a recent window of blocks, so this shows what is happening now rather than
 * all history.
 */
import { createPublicClient, http, type Address, type PublicClient } from 'viem'
import { CONTRACTS, RPC_URLS, robinhoodChain, v2CurveAbi, v2FactoryAbi, v2TokenAbi } from '@/chain-adapter'

/**
 * One client per endpoint, tried in order - but only for the right failures.
 *
 * A single hostname is enough for an ad blocker, a corporate filter or a DNS
 * problem to take the whole site down while the chain itself is perfectly
 * healthy, so one endpoint is not enough. But these endpoints are not
 * interchangeable either: one answers eth_blockNumber and then refuses
 * eth_getLogs for want of archive access, another caps the block range. A
 * refusal therefore says nothing about what the next endpoint will do, and the
 * list has to be walked whatever the reason.
 *
 * What made viem's own fallback unusable here was not the walking but the
 * retrying - every transport retried with backoff before the next was tried,
 * so a failing query took minutes to give up and the page simply hung. This
 * makes exactly one pass, with no retries and a short timeout, so the worst
 * case is bounded at three attempts rather than open-ended.
 */
/*
 * The same-origin proxy first, then the public endpoints.
 *
 * `/rpc` is a Vercel rewrite onto the chain's RPC. Going through this origin
 * means the browser never performs a cross-origin request, so the upstream's
 * intermittently duplicated `Access-Control-Allow-Origin: *,*` - which the
 * browser rejects before the response can be read - cannot reach the page at
 * all. The direct URLs stay behind it so a local static serve, where the
 * rewrite does not exist, still works.
 */
const ENDPOINTS: string[] = ['/rpc', ...RPC_URLS]

const clients: PublicClient[] = ENDPOINTS.map((url) =>
  createPublicClient({
    chain: robinhoodChain,
    // Short and no internal retry: failing over beats waiting on a dead host.
    transport: http(url, { timeout: 9_000, retryCount: 0 }),
    batch: { multicall: { wait: 24 } },
  }),
)

/** The primary, for callers that hold a client directly. */
export const client: PublicClient = clients[0]!

/**
 * A request the browser never managed to send, or that died in transit.
 *
 * Fetch reports a blocked request exactly as it reports an offline machine, so
 * this cannot tell a blocker from a dead network - only that nothing came
 * back. An endpoint that replied, even to refuse, produces an RPC error with a
 * code and is deliberately not matched here.
 */
function unreachable(error: unknown): boolean {
  const text = String((error as Error)?.message ?? error)
  return (
    /failed to fetch|load failed|networkerror|fetch failed|timed out|timeout|aborted|err_/i.test(
      text,
    ) || /HTTP request failed/i.test(text)
  )
}

/** Raised when every endpoint was unreachable, which is not a chain problem. */
export class ChainUnreachableError extends Error {
  constructor(host: string) {
    super(
      `Could not reach ${host} after several attempts. This RPC intermittently ` +
        'returns a duplicated CORS header, which browsers reject outright — it is ' +
        'a fault at the endpoint, not at this page or your connection, and it ' +
        'usually clears within a few seconds. Retry, or check for an extension ' +
        'blocking requests if it never succeeds.',
    )
    this.name = 'ChainUnreachableError'
  }
}

/** Small pause between attempts, so a retry lands on a different moment. */
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Run a read against the first endpoint that can serve it.
 *
 * Endpoints are tried in order rather than raced, so the primary carries the
 * traffic and the others exist for the day it cannot be reached.
 */
async function viaAny<T>(run: (c: PublicClient) => Promise<T>): Promise<T> {
  let blockedHost: string | null = null
  let lastError: unknown

  /*
   * Retry the same endpoint before moving on.
   *
   * One repeat, not a handful. A request that never arrived is worth asking
   * for again, but every extra attempt also counts against the upstream's rate
   * limit - and since the proxy puts all of this site's traffic behind a single
   * address, that limit is now the tighter of the two constraints.
   */
  for (let i = 0; i < clients.length; i += 1) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await run(clients[i]!)
      } catch (error) {
        lastError = error
        if (!unreachable(error)) break
        if (blockedHost === null) blockedHost = hostOf(ENDPOINTS[i])
        if (attempt < 1) await pause(300)
      }
    }
  }

  /*
   * Report the failure the reader can act on, not the last one that happened.
   *
   * When the main endpoint is blocked locally the run ends on a backup
   * refusing the query, and reporting that produces a message about someone
   * else's free-tier block-range limit - true, useless, and pointing at the
   * wrong thing entirely. An endpoint that could not be reached at all is the
   * actionable fault whenever there is one, so it wins.
   */
  if (blockedHost) throw new ChainUnreachableError(blockedHost)
  throw lastError
}

function hostOf(url: string | undefined): string {
  if (!url) return 'the chain'
  // A relative endpoint is this origin; naming it that way is clearer than
  // printing a path at someone.
  if (url.startsWith('/')) return 'the chain'
  try {
    return new URL(url).host
  } catch {
    return 'the chain'
  }
}

/**
 * The head, fetched once per burst.
 *
 * Every reader used to open with its own eth_blockNumber, and that round trip
 * sits in front of the work rather than beside it. Reads started within a few
 * seconds of each other share one answer; a couple of seconds of drift costs
 * nothing when the window is tens of thousands of blocks wide.
 */
let headCache: { at: number; value: Promise<bigint> } | null = null

export function getHead(): Promise<bigint> {
  if (!headCache || Date.now() - headCache.at > 5_000) {
    headCache = { at: Date.now(), value: viaAny((c) => c.getBlockNumber()) }
    headCache.value.catch(() => (headCache = null))
  }
  return headCache.value
}

/** Nothing on this page may hang indefinitely; a stuck read shows as an error. */
function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ])
}

export interface ChainToken {
  address: Address
  curve: Address
  deployer: Address
  name: string
  symbol: string
  logo: string
  raised: bigint
  threshold: bigint
  /** Symbol of the asset the curve raises in - not always ETH. */
  quoteSymbol: string
  /** Decimals of that asset - USDG is 6, not 18. */
  quoteDecimals: number
  launchedAtBlock: bigint
}

export interface ChainTrade {
  txHash: string
  logIndex: number
  block: bigint
  side: 'buy' | 'sell'
  trader: Address
  curve: Address
  quote: bigint
  tokens: bigint
}

const event = (abi: readonly unknown[], name: string) =>
  (abi as { type: string; name: string }[]).find((e) => e.type === 'event' && e.name === name) as never

const NATIVE = '0x0000000000000000000000000000000000000000'

/**
 * Robinhood Chain launches raise in tokenised equities as well as ETH, and
 * USDG is 6-decimal. Labelling every quote "ETH" at 18 decimals misreports
 * both the unit and the size, so read the curve's pair token. Distinct assets
 * are few, so the lookup is cached for the life of the page.
 */
const quoteAssets = new Map<Address, Promise<{ symbol: string; decimals: number }>>()

export function quoteAsset(pair: Address): Promise<{ symbol: string; decimals: number }> {
  if (pair.toLowerCase() === NATIVE) return Promise.resolve({ symbol: 'ETH', decimals: 18 })
  let known = quoteAssets.get(pair)
  if (!known) {
    known = Promise.all([
      viaAny((c) => c.readContract({ address: pair, abi: v2TokenAbi, functionName: 'symbol' })),
      viaAny((c) => c.readContract({ address: pair, abi: v2TokenAbi, functionName: 'decimals' })),
    ])
      .then(([symbol, decimals]) => ({ symbol: symbol as string, decimals: Number(decimals) }))
      // An unreadable asset is shown by address rather than mislabelled as ETH.
      .catch(() => ({ symbol: `${pair.slice(0, 6)}…`, decimals: 18 }))
    quoteAssets.set(pair, known)
  }
  return known
}

/** Recent launches, newest first, with live curve state for each. */
export async function fetchLaunches(windowBlocks = 9_000n, max = 24): Promise<ChainToken[]> {
  const head = await getHead()
  const logs = await withTimeout(
    viaAny((c) =>
      c.getLogs({
        address: CONTRACTS.v2Factory,
        event: event(v2FactoryAbi, 'TokenLaunched'),
        fromBlock: head - windowBlocks,
        toBlock: head,
      }),
    ),
    15_000,
    'Reading launches',
  )

  const recent = (logs as unknown as LaunchLog[]).slice(-max).reverse()
  if (recent.length === 0) return []

  /*
   * One aggregated call instead of eight per token.
   *
   * Fanning out turned thirty launches into roughly two hundred separate
   * requests, which is where the board was slowest and least reliable - any
   * one of them stalling held up the whole grid. Multicall3 collapses that
   * into a couple of round trips, and allowFailure means a single unreadable
   * field costs that field rather than the token, and never the page.
   */
  const READS = [
    { abi: v2TokenAbi, fn: 'name', on: 'token' },
    { abi: v2TokenAbi, fn: 'symbol', on: 'token' },
    { abi: v2TokenAbi, fn: 'logo', on: 'token' },
    { abi: v2CurveAbi, fn: 'realQuoteReserve', on: 'curve' },
    { abi: v2CurveAbi, fn: 'graduationThreshold', on: 'curve' },
    { abi: v2CurveAbi, fn: 'pairToken', on: 'curve' },
  ] as const

  /*
   * One aggregate for the whole page of launches.
   *
   * This was briefly split into groups, and then into individual reads, while
   * the real fault was still thought to be batch size. It was not - it was the
   * CORS header, now fixed by proxying - and the workaround turned a single
   * failed request into thirty, which the upstream answered with 429s. Request
   * volume is the constraint that actually binds here, so the cheapest shape
   * wins: one call, retried, never fanned out.
   */
  const results = await withTimeout(
    viaAny((c) =>
      c.multicall({
        contracts: recent.flatMap((log) =>
          READS.map((r) => ({
            address: r.on === 'token' ? log.args.token : log.args.curve,
            abi: r.abi,
            functionName: r.fn,
          })),
        ) as never,
        allowFailure: true,
      }),
    ),
    35_000,
    'Reading launch details',
  )

  const value = <T,>(i: number, fallback: T): T => {
    const cell = results[i] as { status: string; result?: unknown } | undefined
    return cell && cell.status === 'success' ? (cell.result as T) : fallback
  }

  const tokens: ChainToken[] = recent.map((log, n) => {
    const at = n * READS.length
    return {
      address: log.args.token,
      curve: log.args.curve,
      deployer: log.args.deployer,
      name: value(at, ''),
      symbol: value(at + 1, ''),
      logo: value(at + 2, ''),
      raised: value(at + 3, 0n),
      threshold: value(at + 4, 0n),
      quoteSymbol: 'ETH',
      quoteDecimals: 18,
      launchedAtBlock: log.blockNumber,
    }
  })

  // Quote assets resolve per distinct pair token, not per launch.
  const pairs = recent.map((_, n) => value<Address>(n * READS.length + 5, NATIVE as Address))
  const assets = await Promise.all(pairs.map((pair) => quoteAsset(pair)))
  assets.forEach((asset, n) => {
    const t = tokens[n]
    if (!t) return
    t.quoteSymbol = asset.symbol
    t.quoteDecimals = asset.decimals
  })

  // A launch with no name and no symbol read back is a dead entry, not a token.
  const named = tokens.filter((t) => t.name !== '' || t.symbol !== '')

  /*
   * Losing every name means the aggregate failed, not that nothing launched.
   * Returning an empty list here would print a confident "0 in the last ~40k
   * blocks" over a window that plainly had launches in it, so this fails
   * loudly instead and lets the board offer a retry.
   */
  if (named.length === 0) {
    throw new Error(
      'Could not read launch details. Every attempt was refused, including the ' +
        'one-at-a-time fallback — the RPC is intermittently returning a broken ' +
        'CORS header right now, which browsers reject before the response is ' +
        'read. It usually clears within a few seconds.',
    )
  }
  return named
}

interface LaunchLog {
  args: { token: Address; curve: Address; deployer: Address }
  blockNumber: bigint
}

/** One CurveBuy or CurveSell log as a trade. Buy and sell name their fields
 *  differently but describe the same thing, so both land in one shape. */
function toTrade(log: unknown, side: 'buy' | 'sell'): ChainTrade {
  const l = log as {
    args: Record<string, bigint | Address>
    transactionHash: string
    logIndex: number
    blockNumber: bigint
    address: Address
  }
  return {
    txHash: l.transactionHash,
    logIndex: l.logIndex,
    block: l.blockNumber,
    side,
    trader: (side === 'buy' ? l.args.buyer : l.args.seller) as Address,
    curve: l.address,
    quote: (side === 'buy' ? l.args.quoteIn : l.args.quoteOut) as bigint,
    tokens: (side === 'buy' ? l.args.tokensOut : l.args.tokensIn) as bigint,
  }
}

/** Recent curve trades across every launch, scanned by topic. */
export async function fetchTrades(windowBlocks = 2_500n, max = 60): Promise<ChainTrade[]> {
  const head = await getHead()
  const range = { fromBlock: head - windowBlocks, toBlock: head }

  const [buys, sells] = await withTimeout(
    Promise.all([
      viaAny((c) => c.getLogs({ event: event(v2CurveAbi, 'CurveBuy'), ...range })),
      viaAny((c) => c.getLogs({ event: event(v2CurveAbi, 'CurveSell'), ...range })),
    ]),
    15_000,
    'Reading trades',
  )

  return [...buys.map((l) => toTrade(l, 'buy')), ...sells.map((l) => toTrade(l, 'sell'))]
    .sort((a, b) => Number(b.block - a.block) || b.logIndex - a.logIndex)
    .slice(0, max)
}

/**
 * Walk backwards from the head in fixed spans.
 *
 * The span is held under 10,000 blocks because that is the cap the fallback
 * endpoints enforce. Asking for more works on the primary and is refused by
 * every alternate, which quietly turns the failover into decoration - the one
 * situation it exists for is the one where the primary is unavailable.
 *
 * The node rejects a wide getLogs outright - a 400k-block range comes back as
 * "Missing or invalid parameters", which reads like a malformed call rather
 * than a range limit. Robinhood Chain also produces roughly 850k blocks a day,
 * so a span that looks enormous is about an hour of trading. Scanning in
 * chunks keeps each request inside the limit, and stopping once enough fills
 * are in hand keeps a busy wallet from costing more requests than a quiet one.
 */
const CHUNK = 9_000n
const ENOUGH = 400

async function scanBack(
  head: bigint,
  maxChunks: number,
  read: (range: { fromBlock: bigint; toBlock: bigint }) => Promise<unknown[]>,
): Promise<unknown[]> {
  const found: unknown[] = []
  let toBlock = head
  for (let i = 0; i < maxChunks && toBlock > 0n && found.length < ENOUGH; i += 1) {
    const fromBlock = toBlock > CHUNK ? toBlock - CHUNK : 0n
    try {
      found.push(...(await read({ fromBlock, toBlock })))
    } catch {
      // One unreadable span should not discard the spans that did return.
      break
    }
    toBlock = fromBlock - 1n
  }
  return found
}

/* ------------------------------------------------------------------ */
/* Traders                                                            */
/* ------------------------------------------------------------------ */

export interface BoardEntry {
  wallet: Address
  trades: number
  buys: number
  sells: number
  /** ETH-quoted volume only; other assets are counted but not added in. */
  ethVolume: bigint
  otherAssetTrades: number
}

/**
 * The open leaderboard: every wallet trading curves right now, ranked without
 * anyone having to register.
 */
export async function fetchTraderBoard(windowBlocks = 9_000n, max = 25): Promise<BoardEntry[]> {
  const head = await getHead()
  const range = { fromBlock: head - windowBlocks, toBlock: head }

  const [buys, sells] = await withTimeout(
    Promise.all([
      viaAny((c) => c.getLogs({ event: event(v2CurveAbi, 'CurveBuy'), ...range })),
      viaAny((c) => c.getLogs({ event: event(v2CurveAbi, 'CurveSell'), ...range })),
    ]),
    20_000,
    'Reading the leaderboard',
  )

  const trades = [...buys.map((l) => toTrade(l, 'buy')), ...sells.map((l) => toTrade(l, 'sell'))]
  const curves = [...new Set(trades.map((t) => t.curve))]

  // Only ETH curves contribute to the ranked figure: adding a 6-decimal asset
  // to an 18-decimal one produces a number that means nothing.
  const isEth = new Map<Address, boolean>()
  await Promise.all(
    curves.map(async (curve) => {
      try {
        const pair = (await viaAny((c) =>
          c.readContract({ address: curve, abi: v2CurveAbi, functionName: 'pairToken' }),
        )) as Address
        isEth.set(curve, pair.toLowerCase() === NATIVE)
      } catch {
        isEth.set(curve, false)
      }
    }),
  )

  const board = new Map<string, BoardEntry>()
  for (const t of trades) {
    const key = t.trader.toLowerCase()
    const entry =
      board.get(key) ??
      { wallet: t.trader, trades: 0, buys: 0, sells: 0, ethVolume: 0n, otherAssetTrades: 0 }
    entry.trades += 1
    if (t.side === 'buy') entry.buys += 1
    else entry.sells += 1
    if (isEth.get(t.curve)) entry.ethVolume += t.quote
    else entry.otherAssetTrades += 1
    board.set(key, entry)
  }

  return [...board.values()]
    .sort((a, b) => (b.ethVolume === a.ethVolume ? b.trades - a.trades : b.ethVolume > a.ethVolume ? 1 : -1))
    .slice(0, max)
}

'use client'

/**
 * The live pump.fun feed, read straight from Solana in the browser.
 *
 * A log subscription on pump.fun's program delivers every launch, trade and
 * graduation as it confirms. On top of that sit a short backfill (so the page
 * is not empty for its first seconds) and a polling fallback (for RPCs whose
 * websocket is missing or throttled). Everything shown is decoded from those
 * events; nothing is fetched from pump.fun's own servers.
 *
 * This is a window, not an index: it covers what happened since the tab
 * opened plus the last snapshot it kept, and says so wherever it matters.
 */
import type { PumpEvent, TradeEvent } from './events'
import { PUMP_PROGRAM } from './config'
import { curveProgress, marketCapSol } from './math'
import { readCache, writeCache } from '../cache'

type Deps = typeof import('./feedDeps')
let depsPromise: Promise<Deps> | null = null
/** The Solana libraries and decoder, fetched after the first paint. */
function deps(): Promise<Deps> {
  if (!depsPromise) {
    depsPromise = import('./feedDeps')
    depsPromise.catch(() => (depsPromise = null))
  }
  return depsPromise
}

export interface Coin {
  mint: string
  name: string
  symbol: string
  uri: string
  image: string
  description: string
  creator: string
  /** Seconds. Null when the launch happened before this tab was watching. */
  createdAt: number | null
  lastTradeAt: number
  virtualSol: bigint
  virtualToken: bigint
  realToken: bigint
  marketCapSol: number
  progress: number
  complete: boolean
  holderReward: boolean
  buys: number
  sells: number
  volumeSol: bigint
  traders: number
  /** Whether name and image have been looked up yet. */
  enriched: boolean
}

export interface Trader {
  wallet: string
  buys: number
  sells: number
  solIn: bigint
  solOut: bigint
  coins: number
  last: number
}

export interface FeedState {
  coins: Map<string, Coin>
  trades: TradeEvent[]
  traders: Map<string, Trader>
  status: 'connecting' | 'live' | 'polling' | 'error'
  error: string | null
  since: number
  events: number
}

const MAX_TRADES = 250
const MAX_COINS = 400
const MAX_TRADERS = 1_000

/** Per-trader coin sets, kept beside the state so it serialises cleanly. */
const traderCoins = new Map<string, Set<string>>()
const coinTraders = new Map<string, Set<string>>()

let state: FeedState = {
  coins: new Map(),
  trades: [],
  traders: new Map(),
  status: 'connecting',
  error: null,
  since: Math.floor(Date.now() / 1000),
  events: 0,
}

const listeners = new Set<() => void>()
let version = 0
let scheduled = false

function emit() {
  if (scheduled) return
  scheduled = true
  // Bursts of events repaint once, not once each.
  setTimeout(() => {
    scheduled = false
    version++
    // Pruned and sorted once per repaint rather than once per event: at a
    // couple of hundred events a second, per-event sorting starved the page.
    prune()
    const trades = state.trades.sort((a, b) => b.timestamp - a.timestamp || b.index - a.index).slice(0, MAX_TRADES)
    state = { ...state, trades }
    for (const l of listeners) l()
  }, 1_000)
}

export function subscribeFeed(listener: () => void): () => void {
  listeners.add(listener)
  start()
  return () => {
    listeners.delete(listener)
  }
}

export function getFeed(): FeedState {
  return state
}

export function feedVersion(): number {
  return version
}

/* ------------------------------------------------------------------ */
/* Applying events                                                     */
/* ------------------------------------------------------------------ */

const seen = new Set<string>()

function blankCoin(mint: string): Coin {
  return {
    mint,
    name: '',
    symbol: '',
    uri: '',
    image: '',
    description: '',
    creator: '',
    createdAt: null,
    lastTradeAt: 0,
    virtualSol: 0n,
    virtualToken: 0n,
    realToken: 0n,
    marketCapSol: 0,
    progress: 0,
    complete: false,
    holderReward: false,
    buys: 0,
    sells: 0,
    volumeSol: 0n,
    traders: 0,
    enriched: false,
  }
}

function apply(event: PumpEvent) {
  const key = event.kind === 'trade' ? `${event.sig}:${event.index}` : `${event.sig}:${event.kind}:${event.mint}`
  if (seen.has(key)) return
  seen.add(key)
  if (seen.size > 20_000) seen.clear()
  state.events++

  if (event.kind === 'launch') {
    const coin = state.coins.get(event.mint) ?? blankCoin(event.mint)
    coin.name = event.name
    coin.symbol = event.symbol
    coin.uri = event.uri
    coin.creator = event.creator
    coin.createdAt = event.timestamp || Math.floor(Date.now() / 1000)
    coin.holderReward = event.holderReward
    if (coin.virtualToken === 0n) {
      coin.virtualSol = event.virtualSol
      coin.virtualToken = event.virtualToken
      coin.realToken = event.realToken
      coin.marketCapSol = marketCapSol(event.virtualSol, event.virtualToken, event.totalSupply || undefined)
    }
    state.coins.set(event.mint, coin)
    void enrich(coin)
  } else if (event.kind === 'trade') {
    const coin = state.coins.get(event.mint) ?? blankCoin(event.mint)
    if (event.timestamp >= coin.lastTradeAt) {
      coin.virtualSol = event.virtualSol
      coin.virtualToken = event.virtualToken
      coin.realToken = event.realToken
      coin.marketCapSol = event.isSol ? marketCapSol(event.virtualSol, event.virtualToken) : coin.marketCapSol
      coin.progress = curveProgress(event.realToken)
      coin.lastTradeAt = event.timestamp
      if (event.realToken === 0n) coin.complete = true
    }
    if (!coin.creator) coin.creator = event.creator
    if (event.isBuy) coin.buys++
    else coin.sells++
    if (event.isSol) coin.volumeSol += event.sol
    const holders = coinTraders.get(event.mint) ?? new Set<string>()
    holders.add(event.user)
    coinTraders.set(event.mint, holders)
    coin.traders = holders.size
    state.coins.set(event.mint, coin)

    state.trades.push(event)

    const trader = state.traders.get(event.user) ?? {
      wallet: event.user,
      buys: 0,
      sells: 0,
      solIn: 0n,
      solOut: 0n,
      coins: 0,
      last: 0,
    }
    if (event.isBuy) {
      trader.buys++
      if (event.isSol) trader.solIn += event.sol
    } else {
      trader.sells++
      if (event.isSol) trader.solOut += event.sol
    }
    const coins = traderCoins.get(event.user) ?? new Set<string>()
    coins.add(event.mint)
    traderCoins.set(event.user, coins)
    trader.coins = coins.size
    trader.last = Math.max(trader.last, event.timestamp)
    state.traders.set(event.user, trader)
  } else {
    const coin = state.coins.get(event.mint) ?? blankCoin(event.mint)
    coin.complete = true
    coin.progress = 100
    state.coins.set(event.mint, coin)
  }
  emit()
}

function prune() {
  if (state.coins.size > MAX_COINS) {
    const ordered = [...state.coins.values()].sort(
      (a, b) => Math.max(b.lastTradeAt, b.createdAt ?? 0) - Math.max(a.lastTradeAt, a.createdAt ?? 0),
    )
    for (const c of ordered.slice(Math.floor(MAX_COINS * 0.8))) {
      state.coins.delete(c.mint)
      coinTraders.delete(c.mint)
    }
  }
  if (state.traders.size > MAX_TRADERS) {
    const ordered = [...state.traders.values()].sort((a, b) => b.last - a.last)
    for (const t of ordered.slice(Math.floor(MAX_TRADERS * 0.8))) {
      state.traders.delete(t.wallet)
      traderCoins.delete(t.wallet)
    }
  }
}

/* ------------------------------------------------------------------ */
/* Metadata                                                            */
/* ------------------------------------------------------------------ */

const enriching = new Set<string>()
const queue: Coin[] = []
let active = 0

/**
 * Names and images are looked up only for coins someone is looking at, a few
 * at a time. pump.fun sees hundreds of mints a minute, and fetching metadata
 * for every one would spend the RPC's rate limit on coins nobody sees.
 */
export function ensureMetadata(mint: string) {
  const coin = state.coins.get(mint)
  if (coin && !coin.enriched) void enrich(coin)
}

function enrich(coin: Coin): Promise<void> {
  if (coin.enriched || enriching.has(coin.mint)) return Promise.resolve()
  enriching.add(coin.mint)
  queue.push(coin)
  pump()
  return Promise.resolve()
}

function pump() {
  while (active < 3 && queue.length) {
    const coin = queue.shift()!
    active++
    void (async () => {
      try {
        const { PublicKey, TOKEN_2022_PROGRAM_ID, getConnection, fetchOnchainMetadata, fetchUriMetadata } = await deps()
        if (!coin.uri) {
          const mint = new PublicKey(coin.mint)
          const info = await getConnection().getAccountInfo(mint)
          const program = info?.owner ?? TOKEN_2022_PROGRAM_ID
          const meta = await fetchOnchainMetadata(mint, program)
          if (meta) {
            coin.name = coin.name || meta.name
            coin.symbol = coin.symbol || meta.symbol
            coin.uri = meta.uri
          }
        }
        if (coin.uri) {
          const json = await fetchUriMetadata(coin.uri)
          if (json) {
            coin.image = json.image ?? ''
            coin.description = json.description ?? ''
          }
        }
      } catch {
        /* left without art; shown with initials */
      } finally {
        coin.enriched = true
        active--
        emit()
        pump()
      }
    })()
  }
}

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

let started = false
let lastMessage = 0
let pollTimer: ReturnType<typeof setInterval> | null = null
let lastPolled: string | undefined

function setStatus(status: FeedState['status'], error: string | null = null) {
  if (state.status === status && state.error === error) return
  state.status = status
  state.error = error
  emit()
}

/**
 * pump.fun produces a couple of hundred program messages a second, which is
 * fine on a desktop connection and too much for a phone on mobile data. Small
 * screens and data-saver connections therefore sample by polling instead of
 * streaming, and every device stops streaming while the tab is hidden.
 */
function prefersPolling(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return Boolean(conn?.saveData) || window.matchMedia('(max-width: 768px)').matches
}

let subscription: number | null = null

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  restore()
  void backfill()
  if (prefersPolling()) startPolling()
  else subscribe()
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      unsubscribe()
      stopPolling()
    } else {
      void backfill()
      if (prefersPolling()) startPolling()
      else subscribe()
    }
  })
  // A websocket that never speaks is as good as none: poll instead.
  setInterval(() => {
    if (document.hidden) return
    if (Date.now() - lastMessage > 15_000 && !pollTimer) startPolling()
    persist()
  }, 5_000)
}

function unsubscribe() {
  if (subscription === null) return
  const id = subscription
  subscription = null
  void deps().then(({ getConnection }) => getConnection().removeOnLogsListener(id)).catch(() => undefined)
}

let subscribing = false

function subscribe() {
  if (subscription !== null || subscribing) return
  subscribing = true
  void deps()
    .then(({ getConnection, PublicKey, eventsFromLogs }) => {
      subscribing = false
      if (subscription !== null || document.hidden) return
      subscription = getConnection().onLogs(
        new PublicKey(PUMP_PROGRAM),
        (logs) => {
          lastMessage = Date.now()
          if (pollTimer && !prefersPolling()) stopPolling()
          if (state.status !== 'live') setStatus('live')
          if (logs.err || !logs.logs.some((l) => l.startsWith('Program data: '))) return
          for (const event of eventsFromLogs(logs.logs, logs.signature)) {
            if (!event.timestamp) event.timestamp = Math.floor(Date.now() / 1000)
            apply(event)
          }
        },
        'confirmed',
      )
    })
    .catch((e) => {
      subscribing = false
      setStatus('polling', String((e as Error).message ?? e))
      startPolling()
    })
}

/** Signatures whose transaction was not readable yet, retried on later passes. */
const pending = new Map<string, number>()

async function fetchAndApply(signatures: string[]): Promise<void> {
  const { getConnection, eventsFromTransaction } = await deps()
  const connection = getConnection()
  for (let i = 0; i < signatures.length; i += 20) {
    const batch = signatures.slice(i, i + 20)
    const txs = await connection
      .getTransactions(batch, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
      .catch(() => batch.map(() => null))
    txs.forEach((tx, n) => {
      const sig = batch[n]!
      if (!tx) {
        // Too fresh for the node that answered: try again on a later pass.
        const tries = (pending.get(sig) ?? 0) + 1
        if (tries <= 3) pending.set(sig, tries)
        else pending.delete(sig)
        return
      }
      pending.delete(sig)
      for (const event of eventsFromTransaction(tx)) apply(event)
    })
  }
}

/**
 * Newest pump.fun transactions. pump.fun runs several transactions a
 * second, and the newest few seconds are often not yet readable from every
 * node, so the backfill reaches a little further back and anything not yet
 * readable is retried on the next pass.
 */
async function readSignatures(limit: number, until?: string): Promise<void> {
  const { getConnection, PublicKey } = await deps()
  const connection = getConnection()
  const sigs = await connection.getSignaturesForAddress(new PublicKey(PUMP_PROGRAM), { limit, until })
  if (sigs[0]) lastPolled = sigs[0].signature
  const ok = sigs.filter((s) => !s.err).slice(0, 40)
  await fetchAndApply([...pending.keys(), ...ok.map((s) => s.signature)].slice(0, 80))
  // The freshest transactions are often not readable yet; give the nodes a
  // moment and pick them up.
  if (pending.size > 0) setTimeout(() => void fetchAndApply([...pending.keys()]).catch(() => undefined), 3_000)
}

let failures = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null

/**
 * The first read, retried on its own with backoff until it lands. A busy or
 * refusing RPC is a passing condition, so visitors see "connecting" rather
 * than an error they can do nothing about.
 */
async function backfill() {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  try {
    await readSignatures(60)
    failures = 0
    if (state.status !== 'live') setStatus('live')
  } catch (e) {
    failures++
    if (state.coins.size === 0 && failures >= 4) setStatus('error', String((e as Error).message ?? e))
    retryTimer = setTimeout(() => void backfill(), Math.min(30_000, 2_000 * 2 ** Math.min(failures, 4)))
  }
}

function startPolling() {
  if (pollTimer) return
  setStatus('polling')
  pollTimer = setInterval(() => {
    readSignatures(25, lastPolled).catch(() => {
      /* the next tick tries again */
    })
  }, 6_000)
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

/** Retry from scratch after an error the reader chose to retry. */
export function retryFeed() {
  failures = 0
  setStatus('connecting')
  void backfill()
}

/* ------------------------------------------------------------------ */
/* Snapshot                                                            */
/* ------------------------------------------------------------------ */

interface Snapshot {
  coins: Coin[]
  trades: TradeEvent[]
  traders: Trader[]
  since: number
}

function persist() {
  const coins = [...state.coins.values()]
    .sort((a, b) => Math.max(b.lastTradeAt, b.createdAt ?? 0) - Math.max(a.lastTradeAt, a.createdAt ?? 0))
    .slice(0, 150)
  const traders = [...state.traders.values()].sort((a, b) => Number(b.solIn + b.solOut - (a.solIn + a.solOut))).slice(0, 100)
  writeCache<Snapshot>('pump-feed', { coins, trades: state.trades.slice(0, 80), traders, since: state.since })
}

function restore() {
  const cached = readCache<Snapshot>('pump-feed')
  if (!cached) return
  const { coins, trades, traders, since } = cached.data
  for (const c of coins) state.coins.set(c.mint, { ...c, enriched: Boolean(c.image) })
  for (const t of traders) state.traders.set(t.wallet, t)
  state.trades = trades
  state.since = Math.min(state.since, since)
  for (const t of trades) seen.add(`${t.sig}:${t.index}`)
  emit()
}

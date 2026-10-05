'use client'

/**
 * Recent pump.fun activity for one address, read from its transactions.
 *
 * There is no indexer behind the site, so history is whatever the address's
 * most recent transactions show: the newest few hundred fills for a coin or a
 * wallet. That is stated wherever it is shown.
 */
import { PublicKey, type ConfirmedSignatureInfo } from '@solana/web3.js'
import { bondingCurvePda } from '@pump-fun/pump-sdk'
import { getConnection, withTimeout } from './connection'
import { eventsFromTransaction, type PumpEvent, type TradeEvent } from './events'

const CHUNK = 20

/** Signatures newest first, then their decoded pump.fun events, newest first. */
export async function eventsForAddress(address: PublicKey, limit = 150): Promise<PumpEvent[]> {
  const connection = getConnection()
  const sigs: ConfirmedSignatureInfo[] = await withTimeout(
    connection.getSignaturesForAddress(address, { limit }),
    15_000,
    'Reading signatures',
  )
  const ok = sigs.filter((s) => !s.err).map((s) => s.signature)
  const events: PumpEvent[] = []
  for (let i = 0; i < ok.length; i += CHUNK) {
    const batch = ok.slice(i, i + CHUNK)
    const txs = await withTimeout(
      connection.getTransactions(batch, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }),
      20_000,
      'Reading transactions',
    ).catch(() => [])
    for (const tx of txs) events.push(...eventsFromTransaction(tx))
  }
  return events.sort((a, b) => b.timestamp - a.timestamp)
}

/** The newest fills on one coin's bonding curve. */
export async function coinTrades(mint: PublicKey, limit = 150): Promise<TradeEvent[]> {
  const events = await eventsForAddress(bondingCurvePda(mint), limit)
  const id = mint.toBase58()
  return events.filter((e): e is TradeEvent => e.kind === 'trade' && e.mint === id)
}

export interface WalletRecord {
  wallet: string
  trades: TradeEvent[]
  launches: Extract<PumpEvent, { kind: 'launch' }>[]
  buys: number
  sells: number
  /** SOL in and out, lamports, SOL-quoted coins only. */
  solIn: bigint
  solOut: bigint
  coins: number
  first: number | null
  last: number | null
}

/** What a wallet has actually done on pump.fun, from its recent transactions. */
export async function walletRecord(wallet: PublicKey, limit = 200): Promise<WalletRecord> {
  const events = await eventsForAddress(wallet, limit)
  const id = wallet.toBase58()
  const trades = events.filter((e): e is TradeEvent => e.kind === 'trade' && e.user === id)
  const launches = events.filter(
    (e): e is Extract<PumpEvent, { kind: 'launch' }> => e.kind === 'launch' && (e.user === id || e.creator === id),
  )
  let solIn = 0n
  let solOut = 0n
  for (const t of trades) {
    if (!t.isSol) continue
    if (t.isBuy) solIn += t.sol
    else solOut += t.sol
  }
  const times = trades.map((t) => t.timestamp).filter(Boolean)
  return {
    wallet: id,
    trades,
    launches,
    buys: trades.filter((t) => t.isBuy).length,
    sells: trades.filter((t) => !t.isBuy).length,
    solIn,
    solOut,
    coins: new Set(trades.map((t) => t.mint)).size,
    first: times.length ? Math.min(...times) : null,
    last: times.length ? Math.max(...times) : null,
  }
}

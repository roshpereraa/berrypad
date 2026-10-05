/**
 * pump.fun program events, decoded from transaction logs.
 *
 * The program emits every launch, trade and graduation as an Anchor event.
 * They arrive two ways: as `Program data:` log lines (what a live log
 * subscription sees) and as self-CPI inner instructions (what a fetched
 * transaction also carries). Both are handled, and a transaction is read one
 * way only so nothing is counted twice.
 *
 * Decoding goes through pump.fun's own SDK, which also copes with the shorter
 * layouts older events were written in.
 */
import { Buffer } from 'buffer'
import { PublicKey } from '@solana/web3.js'
import { NATIVE_MINT } from '@solana/spl-token'
import { PUMP_PROGRAM_ID, PUMP_SDK } from '@pump-fun/pump-sdk'
import type { ParsedTransactionWithMeta, VersionedTransactionResponse } from '@solana/web3.js'

const DISC = {
  create: Uint8Array.from([27, 114, 169, 77, 222, 235, 99, 118]),
  trade: Uint8Array.from([189, 219, 127, 211, 78, 230, 97, 238]),
  complete: Uint8Array.from([95, 114, 97, 156, 212, 46, 152, 8]),
}
/** sha256("anchor:event")[0..8], the tag Anchor puts on self-CPI events. */
const EVENT_IX_TAG = Uint8Array.from([0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d])

const PUMP = PUMP_PROGRAM_ID.toBase58()

export interface LaunchEvent {
  kind: 'launch'
  sig: string
  mint: string
  name: string
  symbol: string
  uri: string
  creator: string
  user: string
  bondingCurve: string
  timestamp: number
  holderReward: boolean
  creatorFeeBps: number
  virtualSol: bigint
  virtualToken: bigint
  realToken: bigint
  totalSupply: bigint
}

export interface TradeEvent {
  kind: 'trade'
  sig: string
  /** Position within its transaction, so two fills in one tx stay distinct. */
  index: number
  mint: string
  isBuy: boolean
  /** Quote leg in lamports. Only meaningful when `isSol`. */
  sol: bigint
  tokens: bigint
  user: string
  creator: string
  timestamp: number
  virtualSol: bigint
  virtualToken: bigint
  realSol: bigint
  realToken: bigint
  fee: bigint
  creatorFee: bigint
  /** False for curves quoted in a token (USDC and friends). */
  isSol: boolean
  quoteMint: string
}

export interface CompleteEvent {
  kind: 'complete'
  sig: string
  mint: string
  timestamp: number
}

export type PumpEvent = LaunchEvent | TradeEvent | CompleteEvent

const big = (v: { toString(): string } | null | undefined) => BigInt(v ? v.toString() : '0')

/**
 * Trade events carry the quote leg twice: the original SOL fields and the
 * newer quote fields. Whichever one a given program version filled in wins.
 */
const either = (a: { toString(): string } | null | undefined, b: { toString(): string } | null | undefined) => {
  const first = big(a)
  return first !== 0n ? first : big(b)
}

function startsWith(data: Uint8Array, prefix: Uint8Array, offset = 0): boolean {
  if (data.length < offset + prefix.length) return false
  for (let i = 0; i < prefix.length; i++) if (data[offset + i] !== prefix[i]) return false
  return true
}

function isSolQuote(mint: PublicKey | null | undefined): boolean {
  return !mint || mint.equals(PublicKey.default) || mint.equals(NATIVE_MINT)
}

/** One event payload (discriminator first) into a normalized event. */
export function decodeEventData(data: Uint8Array, sig: string, index: number): PumpEvent | null {
  try {
    const body = Buffer.from(data.subarray(8))
    if (startsWith(data, DISC.trade)) {
      const e = PUMP_SDK.decodeTradeEventBc(body)
      const isSol = isSolQuote(e.quoteMint)
      return {
        kind: 'trade',
        sig,
        index,
        mint: e.mint.toBase58(),
        isBuy: e.isBuy,
        sol: either(e.solAmount, e.quoteAmount),
        tokens: big(e.tokenAmount),
        user: e.user.toBase58(),
        creator: e.creator.toBase58(),
        timestamp: Number(e.timestamp.toString()),
        virtualSol: either(e.virtualSolReserves, e.virtualQuoteReserves),
        virtualToken: big(e.virtualTokenReserves),
        realSol: either(e.realSolReserves, e.realQuoteReserves),
        realToken: big(e.realTokenReserves),
        fee: big(e.fee),
        creatorFee: big(e.creatorFee),
        isSol,
        quoteMint: isSol ? NATIVE_MINT.toBase58() : e.quoteMint.toBase58(),
      }
    }
    if (startsWith(data, DISC.create)) {
      const e = PUMP_SDK.decodeCreateEventBc(body)
      return {
        kind: 'launch',
        sig,
        mint: e.mint.toBase58(),
        name: e.name,
        symbol: e.symbol,
        uri: e.uri,
        creator: e.creator.toBase58(),
        user: e.user.toBase58(),
        bondingCurve: e.bondingCurve.toBase58(),
        timestamp: Number(e.timestamp.toString()),
        holderReward: Boolean(e.isHolderReward),
        creatorFeeBps: Number(e.creatorFeeBps?.toString() ?? 0),
        virtualSol: big(e.virtualSolReserves),
        virtualToken: big(e.virtualTokenReserves),
        realToken: big(e.realTokenReserves),
        totalSupply: big(e.tokenTotalSupply),
      }
    }
    if (startsWith(data, DISC.complete)) {
      const e = PUMP_SDK.decodeCompleteEventBc(body)
      return { kind: 'complete', sig, mint: e.mint.toBase58(), timestamp: Number(e.timestamp.toString()) }
    }
  } catch {
    // A layout this SDK does not know is skipped, not guessed at.
  }
  return null
}

function b64(text: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

/**
 * Events from a transaction's log lines. Only `Program data:` lines written
 * while pump.fun itself is the executing program count; other programs in the
 * same transaction (PumpSwap, routers) log their own events.
 */
export function eventsFromLogs(logs: readonly string[], sig: string): PumpEvent[] {
  const out: PumpEvent[] = []
  const stack: string[] = []
  for (const line of logs) {
    const invoke = line.match(/^Program (\w+) invoke \[\d+\]$/)
    if (invoke) {
      stack.push(invoke[1]!)
      continue
    }
    if (/^Program \w+ (success|failed)/.test(line)) {
      stack.pop()
      continue
    }
    if (line.startsWith('Program data: ') && stack[stack.length - 1] === PUMP) {
      const data = b64(line.slice('Program data: '.length))
      if (!data) continue
      const event = decodeEventData(data, sig, out.length)
      if (event) out.push(event)
    }
  }
  return out
}

/** Events from self-CPI inner instructions, for transactions without log events. */
function eventsFromInner(
  inner: { instructions: { programIdIndex?: number; data: string; programId?: PublicKey }[] }[] | null | undefined,
  keys: string[],
  sig: string,
  decodeData: (data: string) => Uint8Array | null,
): PumpEvent[] {
  const out: PumpEvent[] = []
  for (const group of inner ?? []) {
    for (const ix of group.instructions) {
      const program = ix.programId ? ix.programId.toBase58() : keys[ix.programIdIndex ?? -1]
      if (program !== PUMP) continue
      const data = decodeData(ix.data)
      if (!data || !startsWith(data, EVENT_IX_TAG)) continue
      const event = decodeEventData(data.subarray(8), sig, out.length)
      if (event) out.push(event)
    }
  }
  return out
}

const BS58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function bs58decode(text: string): Uint8Array | null {
  const bytes: number[] = [0]
  for (const ch of text) {
    const v = BS58.indexOf(ch)
    if (v < 0) return null
    let carry = v
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i]! * 58
      bytes[i] = carry & 0xff
      carry >>= 8
    }
    while (carry) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  for (const ch of text) {
    if (ch !== '1') break
    bytes.push(0)
  }
  return Uint8Array.from(bytes.reverse())
}

/** Every pump.fun event in a fetched transaction, in program order. */
export function eventsFromTransaction(
  tx: VersionedTransactionResponse | ParsedTransactionWithMeta | null,
): PumpEvent[] {
  if (!tx || !tx.meta || tx.meta.err) return []
  const sig = tx.transaction.signatures[0] ?? ''
  const fromLogs = eventsFromLogs(tx.meta.logMessages ?? [], sig)
  if (fromLogs.length > 0) return withBlockTime(fromLogs, tx.blockTime)

  const message = tx.transaction.message as unknown as {
    staticAccountKeys?: PublicKey[]
    accountKeys?: (PublicKey | { pubkey: PublicKey })[]
  }
  const keys = [
    ...(message.staticAccountKeys ?? message.accountKeys ?? []).map((k) =>
      'pubkey' in (k as object) ? (k as { pubkey: PublicKey }).pubkey.toBase58() : (k as PublicKey).toBase58(),
    ),
    ...((tx.meta.loadedAddresses?.writable ?? []).map((k) => k.toBase58())),
    ...((tx.meta.loadedAddresses?.readonly ?? []).map((k) => k.toBase58())),
  ]
  const inner = tx.meta.innerInstructions as unknown as
    | { instructions: { programIdIndex?: number; data: string; programId?: PublicKey }[] }[]
    | null
  return withBlockTime(eventsFromInner(inner, keys, sig, bs58decode), tx.blockTime)
}

function withBlockTime(events: PumpEvent[], blockTime: number | null | undefined): PumpEvent[] {
  if (!blockTime) return events
  for (const e of events) if (!e.timestamp) e.timestamp = blockTime
  return events
}

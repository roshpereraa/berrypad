'use client'

/**
 * Launching and trading through pump.fun's program.
 *
 * Every instruction is built by pump.fun's official SDK, so the accounts, fee
 * recipients and argument layouts are theirs rather than reconstructed here.
 * This module adds the parts the SDK leaves to the caller: caching the
 * protocol accounts, quoting, compute budget, simulation before any wallet is
 * asked to sign, and turning program errors into sentences.
 */
import BN from 'bn.js'
import {
  ComputeBudgetProgram,
  Keypair,
  SystemProgram,
  type AddressLookupTableAccount,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
  type TransactionInstruction,
} from '@solana/web3.js'
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  unpackMint,
} from '@solana/spl-token'
import {
  OnlinePumpSdk,
  PUMP_SDK,
  bondingCurvePda,
  computeFeesBps,
  getBuyTokenAmountFromSolAmount,
  newBondingCurve,
  getSellSolAmountFromTokenAmount,
  pumpIdl,
  type BondingCurve,
  type FeeConfig,
  type Global,
  type QuoteControl,
} from '@pump-fun/pump-sdk'
import { BERRYPAD_LAUNCH_REGISTRY } from './config'
import { fetchOnchainMetadata } from './metadata'
import { getConnection } from './connection'

/* ------------------------------------------------------------------ */
/* Protocol state                                                      */
/* ------------------------------------------------------------------ */

let online: OnlinePumpSdk | null = null
export function pumpSdk(): OnlinePumpSdk {
  if (!online) online = new OnlinePumpSdk(getConnection())
  return online
}

export interface Protocol {
  global: Global
  feeConfig: FeeConfig | null
  /** pump.fun's list of extra tokens a coin may be priced in. */
  quoteControl: QuoteControl | null
}

let protocolCache: { at: number; value: Promise<Protocol> } | null = null

/** pump.fun's Global and FeeConfig accounts, shared for a minute at a time. */
export function loadProtocol(): Promise<Protocol> {
  if (!protocolCache || Date.now() - protocolCache.at > 60_000) {
    const sdk = pumpSdk()
    const read = () =>
      Promise.all([
        sdk.fetchGlobal(),
        sdk.fetchFeeConfig().catch(() => null),
        sdk.fetchQuoteControl().catch(() => null),
      ]).then(([global, feeConfig, quoteControl]) => ({ global, feeConfig, quoteControl }))
    const value = read()
      .catch(() => new Promise((r) => setTimeout(r, 1_500)).then(read))
      .catch(() => new Promise((r) => setTimeout(r, 4_000)).then(read))
    protocolCache = { at: Date.now(), value }
    value.catch(() => (protocolCache = null))
  }
  return protocolCache.value
}

export { curveProgress, priceInSol, marketCapSol } from './math'

/* ------------------------------------------------------------------ */
/* Coin state                                                          */
/* ------------------------------------------------------------------ */

export interface Quote {
  mint: PublicKey
  tokenProgram: PublicKey
  decimals: number
  symbol: string
}

export const SOL_QUOTE: Quote = { mint: NATIVE_MINT, tokenProgram: TOKEN_PROGRAM_ID, decimals: 9, symbol: 'SOL' }

export interface CoinState {
  mint: PublicKey
  curve: BondingCurve
  /** SPL Token for legacy coins, Token-2022 for coins made by create_v2. */
  tokenProgram: PublicKey
  isSol: boolean
  /** What the curve is priced in: SOL, or a token pump.fun approved. */
  quote: Quote
  /** The coin's own creator fee in basis points; 0 means pump.fun's standard rate. */
  creatorFeeBps: number
}

const quoteCache = new Map<string, Promise<Quote>>()

/** Decimals, token program and ticker of a quote token. Cached per mint. */
export function resolveQuote(mint: PublicKey, connection: Connection = getConnection()): Promise<Quote> {
  if (mint.equals(NATIVE_MINT) || mint.equals(PublicKey.default)) return Promise.resolve(SOL_QUOTE)
  const key = mint.toBase58()
  let known = quoteCache.get(key)
  if (!known) {
    known = (async () => {
      const info = await connection.getAccountInfo(mint)
      if (!info) throw new Error('The token this coin is priced in could not be read.')
      const parsed = unpackMint(mint, info, info.owner)
      const meta = await fetchOnchainMetadata(mint, info.owner).catch(() => null)
      return { mint, tokenProgram: info.owner, decimals: parsed.decimals, symbol: meta?.symbol || key.slice(0, 4) }
    })()
    known.catch(() => quoteCache.delete(key))
    quoteCache.set(key, known)
  }
  return known
}

export async function fetchCoinState(mint: PublicKey, connection: Connection = getConnection()): Promise<CoinState> {
  const [mintInfo, curveInfo] = await connection.getMultipleAccountsInfo([mint, bondingCurvePda(mint)])
  if (!mintInfo) throw new Error('No token exists at that address.')
  if (!curveInfo) throw new Error('That token was not launched on pump.fun.')
  const curve = PUMP_SDK.decodeBondingCurve(curveInfo)
  const quoteMint = curve.quoteMint
  const isSol = !quoteMint || quoteMint.equals(PublicKey.default) || quoteMint.equals(NATIVE_MINT)
  return {
    mint,
    curve,
    tokenProgram: mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
    isSol,
    quote: isSol ? SOL_QUOTE : await resolveQuote(quoteMint, connection),
    creatorFeeBps: Number(curve.creatorFeeBps?.toString() ?? 0),
  }
}

/**
 * Tokens out for an amount of the quote (lamports for SOL). For a curve that
 * does not exist yet, pass the quote mint and creator fee it will be created
 * with so the estimate uses the same starting reserves and fee.
 */
export function quoteBuy(
  protocol: Protocol,
  curve: BondingCurve | null,
  amountIn: bigint,
  { quoteMint = NATIVE_MINT, creatorFeeBps = 0 }: { quoteMint?: PublicKey; creatorFeeBps?: number } = {},
): bigint {
  const out = getBuyTokenAmountFromSolAmount({
    global: protocol.global,
    feeConfig: protocol.feeConfig,
    mintSupply: curve ? curve.tokenTotalSupply : null,
    bondingCurve: curve,
    amount: new BN(amountIn.toString()),
    quoteMint,
    quoteControl: protocol.quoteControl,
    ...(creatorFeeBps > 0 ? { creatorFeeBps: new BN(creatorFeeBps) } : {}),
  })
  return BigInt(out.toString())
}

/** The highest custom creator fee pump.fun accepts right now, or 0 when it accepts none. */
export function maxCustomCreatorFeeBps(protocol: Protocol): number {
  if (!protocol.global.creatorFeeConfigurable) return 0
  return Number(protocol.global.maxConfigurableCreatorFeeBps.toString())
}

export function quoteSell(protocol: Protocol, curve: BondingCurve, tokens: bigint): bigint {
  const out = getSellSolAmountFromTokenAmount({
    global: protocol.global,
    feeConfig: protocol.feeConfig,
    mintSupply: curve.tokenTotalSupply,
    bondingCurve: curve,
    amount: new BN(tokens.toString()),
  })
  return BigInt(out.toString())
}

/**
 * The fee a trade on a brand-new SOL coin pays, split into pump.fun's share
 * and the creator's. Read from pump.fun's live fee schedule, which tiers by
 * market cap, so it is the rate at launch rather than forever.
 */
export function launchFeesBps(protocol: Protocol): { protocolBps: number; creatorBps: number } {
  const curve = newBondingCurve(protocol.global, NATIVE_MINT)
  const fees = computeFeesBps({
    global: protocol.global,
    feeConfig: protocol.feeConfig,
    mintSupply: protocol.global.tokenTotalSupply,
    virtualQuoteReserves: curve.virtualQuoteReserves,
    virtualTokenReserves: curve.virtualTokenReserves,
    quoteMint: NATIVE_MINT,
  })
  return { protocolBps: Number(fees.protocolFeeBps.toString()), creatorBps: Number(fees.creatorFeeBps.toString()) }
}

/** The fee a new coin priced in `quote` pays, with an optional custom creator fee. */
export function launchFeesFor(protocol: Protocol, quote: Quote, creatorFeeBps = 0): { protocolBps: number; creatorBps: number } {
  if (quote.mint.equals(NATIVE_MINT)) return launchFeesBps(protocol)
  const curve = newBondingCurve(protocol.global, quote.mint, protocol.quoteControl, creatorFeeBps > 0 ? new BN(creatorFeeBps) : undefined)
  const fees = computeFeesBps({
    global: protocol.global,
    feeConfig: protocol.feeConfig,
    mintSupply: protocol.global.tokenTotalSupply,
    virtualQuoteReserves: curve.virtualQuoteReserves,
    virtualTokenReserves: curve.virtualTokenReserves,
    quoteMint: quote.mint,
    ...(creatorFeeBps > 0 ? { creatorFeeBps: new BN(creatorFeeBps) } : {}),
  })
  return { protocolBps: Number(fees.protocolFeeBps.toString()), creatorBps: Number(fees.creatorFeeBps.toString()) }
}

/* ------------------------------------------------------------------ */
/* Instructions                                                        */
/* ------------------------------------------------------------------ */

export interface LaunchInput {
  user: PublicKey
  mint: Keypair
  name: string
  symbol: string
  uri: string
  /** Receives creator fees. Ignored by the program on a holder-reward coin. */
  creator: PublicKey
  /** First buy, in the quote's base units (lamports for SOL). */
  devBuyLamports: bigint
  holderReward: boolean
  /** Price the coin in this token instead of SOL. Needed for a custom creator fee. */
  quote?: Quote
  /** The coin's own creator fee in basis points. Only stored for a token quote. */
  creatorFeeBps?: number
}

export async function launchInstructions(input: LaunchInput): Promise<TransactionInstruction[]> {
  const protocol = await loadProtocol()
  const tokenQuote = input.quote && !input.quote.mint.equals(NATIVE_MINT) ? input.quote : null
  const feeBps = tokenQuote && input.creatorFeeBps ? input.creatorFeeBps : 0
  const base = {
    mint: input.mint.publicKey,
    name: input.name,
    symbol: input.symbol,
    uri: input.uri,
    creator: input.creator,
    user: input.user,
    mayhemMode: false,
    holderReward: input.holderReward,
    ...(feeBps > 0 ? { creatorFeeBps: new BN(feeBps) } : {}),
    ...(tokenQuote ? { quoteMint: tokenQuote.mint, quoteTokenProgram: tokenQuote.tokenProgram } : {}),
  }
  if (input.devBuyLamports <= 0n) {
    return [await PUMP_SDK.createV2Instruction(base)]
  }
  const amount = new BN(
    quoteBuy(protocol, null, input.devBuyLamports, {
      quoteMint: tokenQuote?.mint ?? NATIVE_MINT,
      creatorFeeBps: feeBps,
    }).toString(),
  )
  if (tokenQuote) {
    return PUMP_SDK.createV2AndBuyV2Instructions({
      ...base,
      quoteMint: tokenQuote.mint,
      quoteTokenProgram: tokenQuote.tokenProgram,
      global: protocol.global,
      amount,
      quoteAmount: new BN(input.devBuyLamports.toString()),
    })
  }
  return PUMP_SDK.createV2AndBuyInstructions({
    ...base,
    global: protocol.global,
    amount,
    solAmount: new BN(input.devBuyLamports.toString()),
  })
}

export async function buyInstructions({
  user,
  mint,
  lamports,
  slippagePct,
}: {
  user: PublicKey
  mint: PublicKey
  /** Amount in, in the coin's quote base units (lamports for SOL). */
  lamports: bigint
  slippagePct: number
}): Promise<{ instructions: TransactionInstruction[]; expectedTokens: bigint }> {
  const protocol = await loadProtocol()
  const coin = await fetchCoinState(mint)
  if (coin.curve.complete) throw new Error('This coin has graduated to PumpSwap.')
  const state = await pumpSdk().fetchBuyState(mint, user, coin.tokenProgram, coin.isSol ? undefined : coin.quote.mint)
  const amount = new BN(quoteBuy(protocol, state.bondingCurve, lamports).toString())
  const common = {
    global: protocol.global,
    bondingCurveAccountInfo: state.bondingCurveAccountInfo,
    bondingCurve: state.bondingCurve,
    associatedUserAccountInfo: state.associatedUserAccountInfo,
    mint,
    user,
    amount,
    slippage: slippagePct,
    tokenProgram: coin.tokenProgram,
  }
  const instructions = coin.isSol
    ? await PUMP_SDK.buyInstructions({ ...common, solAmount: new BN(lamports.toString()) })
    : await PUMP_SDK.buyV2Instructions({
        ...common,
        quoteAmount: new BN(lamports.toString()),
        quoteTokenProgram: coin.quote.tokenProgram,
      })
  return { instructions, expectedTokens: BigInt(amount.toString()) }
}

export async function sellInstructions({
  user,
  mint,
  tokens,
  slippagePct,
}: {
  user: PublicKey
  mint: PublicKey
  tokens: bigint
  slippagePct: number
}): Promise<{ instructions: TransactionInstruction[]; expectedLamports: bigint }> {
  const protocol = await loadProtocol()
  const coin = await fetchCoinState(mint)
  if (coin.curve.complete) throw new Error('This coin has graduated to PumpSwap.')
  const state = await pumpSdk().fetchSellState(mint, user, coin.tokenProgram, coin.isSol ? undefined : coin.quote.mint)
  const amount = new BN(tokens.toString())
  const out = getSellSolAmountFromTokenAmount({
    global: protocol.global,
    feeConfig: protocol.feeConfig,
    mintSupply: state.bondingCurve.tokenTotalSupply,
    bondingCurve: state.bondingCurve,
    amount,
  })
  const common = {
    global: protocol.global,
    bondingCurveAccountInfo: state.bondingCurveAccountInfo,
    bondingCurve: state.bondingCurve,
    mint,
    user,
    amount,
    slippage: slippagePct,
    tokenProgram: coin.tokenProgram,
  }
  let instructions: TransactionInstruction[]
  if (coin.isSol) {
    instructions = await PUMP_SDK.sellInstructions({
      ...common,
      solAmount: out,
      mayhemMode: state.bondingCurve.isMayhemMode,
      cashback: state.bondingCurve.isCashbackCoin,
    })
  } else {
    // The proceeds land in the seller's account for the quote token; make
    // sure it exists. Idempotent, so a seller who has one pays nothing extra.
    const quoteAccount = getAssociatedTokenAddressSync(coin.quote.mint, user, true, coin.quote.tokenProgram)
    instructions = [
      createAssociatedTokenAccountIdempotentInstruction(user, quoteAccount, user, coin.quote.mint, coin.quote.tokenProgram),
      ...(await PUMP_SDK.sellV2Instructions({ ...common, quoteAmount: out, quoteTokenProgram: coin.quote.tokenProgram })),
    ]
  }
  return { instructions, expectedLamports: BigInt(out.toString()) }
}

/** Unclaimed creator fees, bonding curve and PumpSwap vaults together. */
export async function creatorFeeBalance(creator: PublicKey): Promise<bigint> {
  const balance = await pumpSdk().getCreatorVaultBalanceBothPrograms(creator)
  return BigInt(balance.toString())
}

export async function collectCreatorFeeInstructions(creator: PublicKey): Promise<TransactionInstruction[]> {
  return pumpSdk().collectCoinCreatorFeeInstructions(creator, creator)
}

export interface TokenFeeBalance {
  quote: Quote
  /** Unclaimed, in the token's base units, curve and PumpSwap vaults together. */
  amount: bigint
}

/**
 * Creator fees from coins priced in a token accrue in that token. One
 * balance per token with anything waiting; SOL is reported separately.
 */
export async function tokenCreatorFeeBalances(creator: PublicKey): Promise<TokenFeeBalance[]> {
  const balances = await pumpSdk().getCreatorVaultQuoteBalances(creator)
  const owed = balances.filter((b) => !b.mint.equals(NATIVE_MINT) && !b.total.isZero())
  return Promise.all(
    owed.map(async (b) => ({
      quote: await resolveQuote(b.mint).catch(() => ({
        mint: b.mint,
        tokenProgram: b.quoteTokenProgram,
        decimals: 6,
        symbol: b.mint.toBase58().slice(0, 4),
      })),
      amount: BigInt(b.total.toString()),
    })),
  )
}

export async function collectTokenCreatorFeeInstructions(
  creator: PublicKey,
  quote: Quote,
): Promise<TransactionInstruction[]> {
  return pumpSdk().collectCoinCreatorFeeV2Instructions(creator, quote.mint, quote.tokenProgram, creator)
}

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

export type Priority = 'normal' | 'fast' | 'turbo'

/** Micro-lamports per compute unit. Turbo at 300k CU costs about 0.0003 SOL. */
/**
 * Micro-lamports per compute unit. The compute limit is set from the
 * simulation, so for a ~230k-unit launch fast costs about 0.0005 SOL and
 * turbo about 0.002 SOL. Too low a fee is why transactions expire unlanded.
 */
export const PRIORITY_PRICE: Record<Priority, number> = {
  normal: 600_000,
  fast: 2_000_000,
  turbo: 8_000_000,
}

export interface Sender {
  publicKey: PublicKey | null
  /** Preferred: sign only, so this site can broadcast and rebroadcast itself. */
  signTransaction?: <T extends VersionedTransaction>(tx: T) => Promise<T>
  sendTransaction: (
    tx: VersionedTransaction,
    connection: Connection,
    options?: { signers?: Keypair[]; maxRetries?: number; skipPreflight?: boolean },
  ) => Promise<string>
}

export class SimulationError extends Error {
  logs: string[]
  constructor(message: string, logs: string[]) {
    super(message)
    this.name = 'SimulationError'
    this.logs = logs
  }
}

async function compile(
  connection: Connection,
  payer: PublicKey,
  instructions: TransactionInstruction[],
  computeUnits: number,
  priority: Priority,
  lookupTables: AddressLookupTableAccount[] = [],
) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_PRICE[priority] }),
      ...instructions,
    ],
  }).compileToV0Message(lookupTables)
  return { tx: new VersionedTransaction(message), blockhash, lastValidBlockHeight }
}

/**
 * A public address lookup table most pump.fun launches already use. It holds
 * pump.fun's fixed accounts (program, Global, event authority, fee
 * recipients, token programs), so a launch can reference each in one byte
 * instead of 32, which keeps create plus first buy in one transaction. It
 * belongs to a third party, so it is checked before every use and the launch
 * falls back to two transactions if it is ever closed.
 */
const LAUNCH_LOOKUP_TABLE = new PublicKey('Hyif6eWb8x88RVrvjPfabsgRYnwkVnyByEXTVTXbUcyP')

export async function launchLookupTable(): Promise<AddressLookupTableAccount | null> {
  try {
    const res = await getConnection().getAddressLookupTable(LAUNCH_LOOKUP_TABLE)
    return res.value && res.value.isActive() ? res.value : null
  } catch {
    return null
  }
}

export function launchMarker(user: PublicKey): TransactionInstruction {
  return SystemProgram.transfer({ fromPubkey: user, toPubkey: BERRYPAD_LAUNCH_REGISTRY, lamports: 0 })
}

/** Runs the transaction against the current chain without anyone signing. */
/** Solana's hard cap on a serialized transaction. */
export const MAX_TX_BYTES = 1232

/**
 * The serialized size these instructions would have, priority-fee
 * instructions included. Uses a placeholder blockhash: the size does not
 * depend on which blockhash is used.
 */
export function transactionSize(
  payer: PublicKey,
  instructions: TransactionInstruction[],
  computeUnits = 300_000,
  lookupTables: AddressLookupTableAccount[] = [],
): number {
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: PublicKey.default.toBase58(),
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
      ...instructions,
    ],
  }).compileToV0Message(lookupTables)
  return new VersionedTransaction(message).serialize().length
}

export async function simulate(
  payer: PublicKey,
  instructions: TransactionInstruction[],
  { computeUnits = 300_000, priority = 'fast' as Priority } = {},
): Promise<{ unitsConsumed: number | null; logs: string[] }> {
  const connection = getConnection()
  const { tx } = await compile(connection, payer, instructions, computeUnits, priority)
  const result = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true })
  const logs = result.value.logs ?? []
  if (result.value.err) {
    throw new SimulationError(explainProgramError(result.value.err, logs), logs)
  }
  return { unitsConsumed: result.value.unitsConsumed ?? null, logs }
}

/**
 * Simulate, then sign and send, then wait for confirmation. Nothing reaches
 * the wallet until the same instructions have run cleanly in simulation.
 */
export async function simulateAndSend(
  wallet: Sender,
  instructions: TransactionInstruction[],
  {
    signers = [] as Keypair[],
    computeUnits = 300_000,
    priority = 'fast' as Priority,
    lookupTables = [] as AddressLookupTableAccount[],
    onSigning,
    onSent,
  }: {
    signers?: Keypair[]
    lookupTables?: AddressLookupTableAccount[]
    computeUnits?: number
    priority?: Priority
    onSigning?: () => void
    onSent?: (signature: string) => void
  } = {},
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Connect a wallet first.')
  const connection = getConnection()
  const { tx, blockhash, lastValidBlockHeight } = await compile(
    connection,
    wallet.publicKey,
    instructions,
    computeUnits,
    priority,
    lookupTables,
  )

  const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: false })
  if (sim.value.err) {
    const logs = sim.value.logs ?? []
    throw new SimulationError(explainProgramError(sim.value.err, logs), logs)
  }

  // Size the compute limit to what the simulation used, with headroom, so
  // the priority fee buys real priority instead of paying for unused units.
  let final = tx
  if (sim.value.unitsConsumed) {
    const units = Math.min(1_400_000, Math.ceil(sim.value.unitsConsumed * 1.2) + 10_000)
    const message = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_PRICE[priority] }),
        ...instructions,
      ],
    }).compileToV0Message(lookupTables)
    final = new VersionedTransaction(message)
  }

  onSigning?.()
  if (wallet.signTransaction) {
    // The wallet signs first; extra signers (the new mint) sign after, so
    // nothing the wallet adds to the transaction can invalidate them.
    const signed = await wallet.signTransaction(final)
    if (signers.length) signed.sign(signers)
    const raw = signed.serialize()
    // The signature is known the moment the wallet signs. From here on the
    // transaction may land at any time, so a failed or rate-limited send is
    // never treated as "not sent": it is resent and its status is polled by
    // this signature until it confirms or provably expires.
    const signature = base58(signed.signatures[0]!)
    onSent?.(signature)
    await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => undefined)
    await rebroadcastUntilConfirmed(connection, raw, signature, lastValidBlockHeight)
    return signature
  }

  const signature = await wallet.sendTransaction(final, connection, { signers, maxRetries: 5 })
  onSent?.(signature)
  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  )
  if (confirmation.value.err) {
    throw new Error(explainProgramError(confirmation.value.err, []))
  }
  return signature
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/** Base58, for turning a raw signature into the string Solana uses. */
export function base58(bytes: Uint8Array): string {
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  let out = ''
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out
    n /= 58n
  }
  for (const b of bytes) {
    if (b !== 0) break
    out = '1' + out
  }
  return out
}

export class ExpiredError extends Error {
  constructor() {
    super(
      'Solana did not pick up the transaction before it expired, so nothing in it ran and no SOL was spent. Try again; a higher priority helps when the network is busy.',
    )
    this.name = 'ExpiredError'
  }
}

/**
 * Send the same signed transaction every two seconds until it confirms or
 * its blockhash expires. Leaders drop transactions under load; resending is
 * what gets them in. A resend of an already-landed transaction is a no-op.
 */
async function rebroadcastUntilConfirmed(
  connection: Connection,
  raw: Uint8Array,
  signature: string,
  lastValidBlockHeight: number,
): Promise<void> {
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2_000))
    const status = (await connection.getSignatureStatuses([signature]).catch(() => null))?.value[0]
    if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
      if (status.err) throw new Error(explainProgramError(status.err, []))
      return
    }
    if (i % 5 === 4) {
      const height = await connection.getBlockHeight('confirmed').catch(() => 0)
      if (height > lastValidBlockHeight) {
        // Public RPCs sit behind load balancers, and a node that has not seen
        // a transaction reports it missing. Before calling anything expired,
        // ask several times with a full history search.
        for (let k = 0; k < 4; k++) {
          const last = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true }).catch(() => null))?.value[0]
          if (last && !last.err) return
          if (last?.err) throw new Error(explainProgramError(last.err, []))
          const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 }).catch(() => null)
          if (tx?.meta && !tx.meta.err) return
          if (tx?.meta?.err) throw new Error(explainProgramError(tx.meta.err, []))
          await new Promise((r) => setTimeout(r, 1_500))
        }
        throw new ExpiredError()
      }
    }
    void connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => undefined)
  }
  throw new ExpiredError()
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

const PROGRAM_ERRORS = new Map<number, { name: string; msg?: string }>(
  (pumpIdl as { errors?: { code: number; name: string; msg?: string }[] }).errors?.map((e) => [
    e.code,
    { name: e.name, msg: e.msg },
  ]) ?? [],
)

const FRIENDLY: Record<string, string> = {
  TooMuchSolRequired: 'The price moved past your slippage limit. Raise slippage or buy a smaller amount.',
  TooLittleSolReceived: 'The price moved past your slippage limit. Raise slippage or sell a smaller amount.',
  BondingCurveComplete: 'This coin has finished its bonding curve and now trades on PumpSwap.',
  HolderRewardDisabled: 'pump.fun has holder rewards switched off right now. Launch without them.',
  CreatorFeeNotConfigurable: 'pump.fun is not accepting custom creator fees right now. Launch with the standard fee.',
  CreatorFeeBpsOutOfRange: 'That creator fee is outside the range pump.fun allows.',
  CreatorFeeNotConfigurableForQuote: 'A custom creator fee cannot be set on a SOL-quoted coin.',
}

/** A program error code or RPC error as something a person can act on. */
export function explainProgramError(err: unknown, logs: string[]): string {
  const text = typeof err === 'string' ? err : JSON.stringify(err)
  const custom = text.match(/"Custom":(\d+)/)
  if (custom) {
    const known = PROGRAM_ERRORS.get(Number(custom[1]))
    if (known) return FRIENDLY[known.name] ?? known.msg ?? known.name
  }
  if (/InsufficientFundsForRent|insufficient lamports|"InsufficientFunds"/i.test(text + logs.join('\n'))) {
    return 'Not enough SOL to cover this plus network fees and account rent.'
  }
  const logged = logs.find((l) => /Error Message:|failed:/.test(l))
  if (logged) return logged.replace(/^Program log: /, '').slice(0, 240)
  return `The transaction would fail: ${text.slice(0, 200)}`
}

export function readableError(error: unknown): string {
  if (!error) return ''
  const raw = String((error as Error)?.message ?? error)
  if (/User rejected|rejected the request|declined|WalletSignTransactionError: User/i.test(raw)) {
    return 'You rejected the request in your wallet.'
  }
  if (/block height exceeded|expired/i.test(raw)) {
    return 'Solana did not pick up the transaction before it expired, so nothing in it ran and no SOL was spent. Try again; a higher priority helps when the network is busy.'
  }
  if (/429|rate limit/i.test(raw)) {
    return 'The Solana RPC is rate-limiting this browser. Wait a few seconds and retry.'
  }
  return raw.split('\n')[0]!.slice(0, 280)
}

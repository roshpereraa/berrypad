/**
 * Swaps between SOL and the token a coin is priced in, routed by Jupiter.
 *
 * Coins with a custom creator fee are priced in a token (WBTC by default),
 * so a creator's first buy and a trader's buy need that token, and creator
 * fees arrive in it. These helpers let every one of those start and end in
 * SOL. The route comes from Jupiter through this site's /api/swap; the
 * transaction is built, simulated and signed here like every other one.
 */
import {
  PublicKey,
  TransactionInstruction,
  type AddressLookupTableAccount,
} from '@solana/web3.js'
import { Buffer } from 'buffer'
import { NATIVE_MINT, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { getConnection } from './connection'
import { SimulationError, simulateAndSend, type Priority, type Quote, type Sender } from './pump'

export interface SwapQuote {
  inAmount: bigint
  outAmount: bigint
  /** The least the swap may deliver before it reverts. */
  minOut: bigint
  priceImpactPct: number
  /** Jupiter's quote, passed back unchanged to build the swap. */
  raw: unknown
}

export async function swapQuote(
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: bigint,
  slippageBps = 100,
): Promise<SwapQuote> {
  const query = new URLSearchParams({
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    amount: amount.toString(),
    slippageBps: String(slippageBps),
  })
  const res = await fetch(`/api/swap?${query}`)
  const body = (await res.json().catch(() => ({}))) as {
    inAmount?: string
    outAmount?: string
    otherAmountThreshold?: string
    priceImpactPct?: string
    error?: string
  }
  if (!res.ok || !body.outAmount) {
    throw new Error(body.error ?? 'No swap route is available right now. Try again in a moment.')
  }
  return {
    inAmount: BigInt(body.inAmount ?? amount.toString()),
    outAmount: BigInt(body.outAmount),
    minOut: BigInt(body.otherAmountThreshold ?? body.outAmount),
    priceImpactPct: Number(body.priceImpactPct ?? 0) * 100,
    raw: body,
  }
}

interface JupInstruction {
  programId: string
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]
  data: string
}

function toInstruction(ix: JupInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(ix.data, 'base64'),
  })
}

async function swapInstructions(
  quote: SwapQuote,
  user: PublicKey,
): Promise<{ instructions: TransactionInstruction[]; lookupTables: AddressLookupTableAccount[] }> {
  const res = await fetch('/api/swap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote.raw,
      userPublicKey: user.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: false,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    setupInstructions?: JupInstruction[]
    swapInstruction?: JupInstruction
    cleanupInstruction?: JupInstruction | null
    otherInstructions?: JupInstruction[]
    addressLookupTableAddresses?: string[]
    error?: string
  }
  if (!res.ok || !body.swapInstruction) {
    throw new Error(body.error ?? 'Could not build the swap. Try again in a moment.')
  }
  // Compute budget is set by simulateAndSend, so Jupiter's is left out.
  const instructions = [
    ...(body.otherInstructions ?? []),
    ...(body.setupInstructions ?? []),
    body.swapInstruction,
    ...(body.cleanupInstruction ? [body.cleanupInstruction] : []),
  ].map(toInstruction)
  const connection = getConnection()
  const lookupTables = (
    await Promise.all(
      (body.addressLookupTableAddresses ?? []).map((a) =>
        connection.getAddressLookupTable(new PublicKey(a)).then((r) => r.value),
      ),
    )
  ).filter((t): t is AddressLookupTableAccount => t !== null)
  return { instructions, lookupTables }
}

/**
 * The wallet's balance of a token, in base units; 0 only when the wallet
 * provably has no account for it. An RPC failure is retried and then thrown,
 * never reported as 0: reading "0" after a swap that landed is what made the
 * launch form swap again.
 */
export async function tokenBalance(owner: PublicKey, quote: Quote): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(quote.mint, owner, true, quote.tokenProgram)
  const connection = getConnection()
  let last: unknown
  for (let i = 0; i < 6; i++) {
    try {
      const info = await connection.getAccountInfo(ata, 'confirmed')
      if (!info) return 0n
      // SPL token account layout: amount is a u64 at offset 64.
      return info.data.readBigUInt64LE(64)
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 700 * (i + 1)))
    }
  }
  throw last instanceof Error ? last : new Error(`Could not read your ${quote.symbol} balance. Try again.`)
}

/** Waits until the balance rises above `above`, for up to `ms`. */
export async function waitForBalanceAbove(owner: PublicKey, quote: Quote, above: bigint, ms = 45_000): Promise<bigint> {
  const until = Date.now() + ms
  let latest = above
  while (Date.now() < until) {
    latest = await tokenBalance(owner, quote).catch(() => latest)
    if (latest > above) return latest
    await new Promise((r) => setTimeout(r, 1_500))
  }
  return latest
}

/*
 * A swap that was signed is remembered (per wallet, for a few minutes), so a
 * reload or a retry waits for it instead of signing another one.
 */
const PENDING_KEY = (owner: PublicKey) => `berrypad.pendingSwap.${owner.toBase58()}`
const PENDING_MS = 3 * 60_000

export function pendingSwap(owner: PublicKey): { signature: string; at: number } | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY(owner))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { signature: string; at: number }
    if (Date.now() - parsed.at > PENDING_MS) {
      localStorage.removeItem(PENDING_KEY(owner))
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function rememberSwap(owner: PublicKey, signature: string | null) {
  try {
    if (signature) localStorage.setItem(PENDING_KEY(owner), JSON.stringify({ signature, at: Date.now() }))
    else localStorage.removeItem(PENDING_KEY(owner))
  } catch {
    /* storage blocked: the balance check still prevents a second swap */
  }
}

/** Whether a swap signature has landed: true, false (failed), or null (unknown yet). */
async function swapOutcome(signature: string): Promise<boolean | null> {
  const status = (
    await getConnection()
      .getSignatureStatuses([signature], { searchTransactionHistory: true })
      .catch(() => null)
  )?.value[0]
  if (!status) return null
  return status.err ? false : status.confirmationStatus !== 'processed' ? true : null
}

export interface SwapResult {
  signature: string | null
  /** How much of the output token the wallet gained. */
  received: bigint
}

/**
 * Swap `lamports` of SOL into `quote`, and report how much arrived.
 *
 * The wallet's balance is the authority. Whatever the confirmation path
 * reports, if the balance went up the swap landed; and a swap signed earlier
 * that may still land is waited for, never repeated.
 */
export async function swapSolFor(
  wallet: Sender,
  quote: Quote,
  lamports: bigint,
  {
    priority = 'fast' as Priority,
    slippageBps = 150,
    onSigning,
    onSent,
  }: { priority?: Priority; slippageBps?: number; onSigning?: () => void; onSent?: (s: string) => void } = {},
): Promise<SwapResult> {
  if (!wallet.publicKey) throw new Error('Connect a wallet first.')
  const user = wallet.publicKey
  const before = await tokenBalance(user, quote)

  const earlier = pendingSwap(user)
  if (earlier) {
    const landed = await swapOutcome(earlier.signature)
    if (landed !== false) {
      const after = await waitForBalanceAbove(user, quote, 0n, 20_000)
      if (after > 0n) {
        rememberSwap(user, null)
        return { signature: earlier.signature, received: after }
      }
    }
    if (landed === null) {
      throw new Error(
        `Your last swap to ${quote.symbol} has not settled yet. Wait a minute and try again; it will not be swapped twice.`,
      )
    }
    rememberSwap(user, null)
  }

  const route = await swapQuote(NATIVE_MINT, quote.mint, lamports, slippageBps)
  const { instructions, lookupTables } = await swapInstructions(route, user)
  let signature: string | null = null
  try {
    signature = await simulateAndSend(wallet, instructions, {
      computeUnits: 1_000_000,
      priority,
      lookupTables,
      onSigning,
      onSent: (s) => {
        signature = s
        rememberSwap(user, s)
        onSent?.(s)
      },
    })
  } catch (e) {
    if (e instanceof SimulationError || !signature) throw e
    // Signed and sent: it may still have landed. The balance decides.
    const after = await waitForBalanceAbove(user, quote, before)
    if (after > before) {
      rememberSwap(user, null)
      return { signature, received: after - before }
    }
    if ((await swapOutcome(signature)) === false) rememberSwap(user, null)
    throw e
  }
  const after = await waitForBalanceAbove(user, quote, before)
  rememberSwap(user, null)
  return { signature, received: after > before ? after - before : route.minOut }
}

/** Swap `amount` of `quote` back into SOL. */
export async function swapToSol(
  wallet: Sender,
  quote: Quote,
  amount: bigint,
  {
    priority = 'fast' as Priority,
    slippageBps = 100,
    onSigning,
    onSent,
  }: { priority?: Priority; slippageBps?: number; onSigning?: () => void; onSent?: (s: string) => void } = {},
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Connect a wallet first.')
  const route = await swapQuote(quote.mint, NATIVE_MINT, amount, slippageBps)
  const { instructions, lookupTables } = await swapInstructions(route, wallet.publicKey)
  return simulateAndSend(wallet, instructions, {
    computeUnits: 1_000_000,
    priority,
    lookupTables,
    onSigning,
    onSent,
  })
}

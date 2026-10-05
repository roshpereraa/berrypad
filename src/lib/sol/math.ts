/**
 * Bonding-curve maths with no dependencies, so pages that only display
 * figures do not have to load pump.fun's SDK.
 */

/** The default sellable supply, used until Global has been read. */
const DEFAULT_INITIAL_REAL_TOKENS = 793_100_000_000_000n

/**
 * Bonding progress as pump.fun shows it: the share of the sellable supply
 * already bought. The curve completes when real token reserves reach zero.
 */
export function curveProgress(realToken: bigint, global?: { initialRealTokenReserves: { toString(): string } } | null): number {
  const initial = global ? BigInt(global.initialRealTokenReserves.toString()) : DEFAULT_INITIAL_REAL_TOKENS
  if (initial <= 0n) return 0
  if (realToken >= initial) return 0
  const bps = ((initial - realToken) * 10_000n) / initial
  return Math.min(100, Number(bps) / 100)
}

/**
 * Quote per whole token, from virtual reserves. The quote is SOL (9
 * decimals) unless the coin is priced in a token.
 */
export function priceInSol(virtualQuote: bigint, virtualToken: bigint, quoteDecimals = 9): number {
  if (virtualToken === 0n) return 0
  return Number(virtualQuote) / 10 ** quoteDecimals / (Number(virtualToken) / 1e6)
}

/** Fully diluted market cap in the quote (SOL by default), the figure pump.fun ranks by. */
export function marketCapSol(
  virtualQuote: bigint,
  virtualToken: bigint,
  supply = 1_000_000_000_000_000n,
  quoteDecimals = 9,
): number {
  if (virtualToken === 0n) return 0
  return Number((virtualQuote * supply) / virtualToken) / 10 ** quoteDecimals
}


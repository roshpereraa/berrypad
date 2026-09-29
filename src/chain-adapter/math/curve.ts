/**
 * Constant-product bonding-curve maths for the launchpad.
 *
 * A faithful bigint reimplementation of LaunchpadV2BondingCurveMath plus the fee and
 * clamping logic in LaunchpadV2BondingCurve.buy/sell. Verified against mainnet: a
 * simulated 0.001 ETH buy returned 576212521589076711882242 and `quoteBuy`
 * below computes the identical integer.
 *
 * Everything is integer arithmetic with the contract's rounding. Never convert
 * to Number here - project rule 6.
 */

export const BASIS_POINTS = 10_000n

export class CurveMathError extends Error {}

/** LaunchpadV2BondingCurveMath.getAmountOut with feeBps applied to the input. */
export function getAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps = 0n,
): bigint {
  if (amountIn <= 0n) throw new CurveMathError('InsufficientInputAmount')
  if (reserveIn <= 0n || reserveOut <= 0n) throw new CurveMathError('InsufficientLiquidity')
  const amountInWithFee = amountIn * (BASIS_POINTS - feeBps)
  const numerator = amountInWithFee * reserveOut
  const denominator = reserveIn * BASIS_POINTS + amountInWithFee
  return numerator / denominator
}

/** LaunchpadV2BondingCurveMath.getAmountIn. Rounds up, as the contract does (+1). */
export function getAmountIn(
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps = 0n,
): bigint {
  if (amountOut <= 0n) throw new CurveMathError('InsufficientOutputAmount')
  if (reserveIn <= 0n || reserveOut <= amountOut) throw new CurveMathError('InsufficientLiquidity')
  if (feeBps >= BASIS_POINTS) throw new CurveMathError('InsufficientLiquidity')
  const numerator = amountOut * reserveIn * BASIS_POINTS
  const denominator = (reserveOut - amountOut) * (BASIS_POINTS - feeBps)
  return numerator / denominator + 1n
}

/** Solidity's Math.mulDiv with Rounding.Ceil. */
export function mulDivCeil(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new CurveMathError('division by zero')
  const product = a * b
  return (product + denominator - 1n) / denominator
}

/**
 * How much of the supply must leave the curve before graduation.
 *
 * reservedTokens = floor(supply * phantomQuote / (phantomQuote + threshold))
 * Confirmed on chain: 1e27 supply, 1.68e18 phantom, 4.2e18 threshold yields
 * reservedTokens = 285714285714285714285714285.
 */
export function reservedTokens(
  supply: bigint,
  phantomQuote: bigint,
  graduationThreshold: bigint,
): bigint {
  const denominator = phantomQuote + graduationThreshold
  if (denominator <= 0n) throw new CurveMathError('invalid curve terms')
  return (supply * phantomQuote) / denominator
}

export interface BuyQuoteInput {
  quoteIn: bigint
  quoteReserve: bigint
  tokenReserve: bigint
  /** Tokens still available before the graduation cap clamps the fill. */
  sellableTokens: bigint
  feeBps: bigint
  creatorTaxBps: bigint
}

export interface BuyQuoteResult {
  /** What the curve actually charges. Less than quoteIn on a clamped fill. */
  spent: bigint
  tokensOut: bigint
  fee: bigint
  creatorTax: bigint
  refund: bigint
  partialFill: boolean
}

/**
 * Mirrors LaunchpadV2BondingCurve.buy.
 *
 * Does NOT model the snipe tax: the deployed curve applies one that is absent
 * from the published source, so a buy inside the opening window must be
 * resolved by simulation instead. Callers gate on currentSnipeTaxBps.
 */
export function quoteBuy(input: BuyQuoteInput): BuyQuoteResult {
  const { quoteIn, quoteReserve, tokenReserve, sellableTokens, feeBps, creatorTaxBps } = input
  if (quoteIn <= 0n) throw new CurveMathError('ZeroAmount')
  if (sellableTokens <= 0n) throw new CurveMathError('CurveGraduated')

  let spent = quoteIn
  let fee = (spent * feeBps) / BASIS_POINTS
  let creatorTax = (spent * creatorTaxBps) / BASIS_POINTS
  let tokensOut = getAmountOut(spent - fee - creatorTax, quoteReserve, tokenReserve)
  let partialFill = false

  if (tokensOut > sellableTokens) {
    // The contract fills up to the cap, charges only for what was received, and
    // refunds the rest rather than reverting.
    partialFill = true
    tokensOut = sellableTokens
    const net = getAmountIn(sellableTokens, quoteReserve, tokenReserve)
    const grossed = mulDivCeil(net, BASIS_POINTS, BASIS_POINTS - feeBps - creatorTaxBps)
    spent = grossed < quoteIn ? grossed : quoteIn
    fee = (spent * feeBps) / BASIS_POINTS
    creatorTax = (spent * creatorTaxBps) / BASIS_POINTS
  }

  return { spent, tokensOut, fee, creatorTax, refund: quoteIn - spent, partialFill }
}

export interface SellQuoteInput {
  tokensIn: bigint
  quoteReserve: bigint
  tokenReserve: bigint
  feeBps: bigint
  creatorTaxBps: bigint
}

export interface SellQuoteResult {
  quoteOut: bigint
  fee: bigint
  creatorTax: bigint
}

/** Mirrors LaunchpadV2BondingCurve.sell. Fees come off the quote output. */
export function quoteSell(input: SellQuoteInput): SellQuoteResult {
  const { tokensIn, quoteReserve, tokenReserve, feeBps, creatorTaxBps } = input
  if (tokensIn <= 0n) throw new CurveMathError('ZeroAmount')
  const gross = getAmountOut(tokensIn, tokenReserve, quoteReserve)
  const fee = (gross * feeBps) / BASIS_POINTS
  const creatorTax = (gross * creatorTaxBps) / BASIS_POINTS
  return { quoteOut: gross - fee - creatorTax, fee, creatorTax }
}

/**
 * Minimum-output bound for a given slippage tolerance in basis points.
 * Always round down, so the bound is never tighter than the user asked for.
 */
export function applySlippage(amountOut: bigint, slippageBps: bigint): bigint {
  if (slippageBps < 0n || slippageBps > BASIS_POINTS) throw new CurveMathError('invalid slippage')
  return (amountOut * (BASIS_POINTS - slippageBps)) / BASIS_POINTS
}

import type { Address, Hex } from 'viem'

/** Which Launchpad factory generation a token belongs to. Project rule 5. */
export type LaunchpadVersion = 'v1' | 'v2'

/**
 * V2 graduation phase, as stored in the launch record.
 * Mirrors GraduationPhase in ILaunchpadV2.sol.
 */
export enum GraduationPhase {
  NotGraduated = 0,
  Swept = 1,
  PoolCreated = 2,
  Rescued = 3,
}

export interface Socials {
  twitter: string
  telegram: string
  discord: string
  website: string
  farcaster: string
}

/** Immutable, on-chain token metadata. Raw values - no formatting applied. */
export interface TokenMetadata {
  address: Address
  name: string
  symbol: string
  decimals: number
  totalSupply: bigint
  /** Opaque URI string as stored on chain, e.g. "ipfs://bafk...". */
  logo: string
  description: string
  socials: Socials
}

/** A token's identity and launch record, normalised across both generations. */
export interface LaunchedToken {
  version: LaunchpadVersion
  address: Address
  deployer: Address
  /** The V2 bonding curve. Always null for V1, which has no curve. */
  curve: Address | null
  /** Quote asset. Zero address means native ETH (V2); V1 launches pair against WETH. */
  pairToken: Address
  creatorFeeRecipient: Address | null
  factory: Address
}

/**
 * Graduation state, normalised across generations.
 *
 * V1 derives this from paired-token principal locked in its Uniswap V3
 * position; V2 from the curve's remaining sellable allocation. The shapes are
 * deliberately different upstream and unified only here.
 */
export interface GraduationStatus {
  version: LaunchpadVersion
  graduated: boolean
  /** Quote raised so far, in the quote asset's smallest unit. */
  raised: bigint
  /** Quote required to graduate. */
  threshold: bigint
  /** V2 only: tokens still to leave the curve. Null for V1. */
  sellableTokens: bigint | null
  /** V2 only. Null for V1. */
  phase: GraduationPhase | null
}

/** Live bonding-curve state. V2 only. */
export interface CurveState {
  curve: Address
  token: Address
  pairToken: Address
  isNativeQuote: boolean
  /** Includes the phantom reserve, as the contract's own getReserves() does. */
  quoteReserve: bigint
  tokenReserve: bigint
  /** Excludes the phantom reserve - this is the real quote raised. */
  realQuoteReserve: bigint
  phantomQuote: bigint
  sellableTokens: bigint
  reservedTokens: bigint
  graduationThreshold: bigint
  feeBps: bigint
  creatorTaxBps: bigint
  graduated: boolean
  readyToGraduate: boolean
}

/**
 * A trade quote. All amounts are raw integers in the asset's smallest unit.
 *
 * `exact` is the important field. It is false whenever the quote could not be
 * computed with certainty off chain - most commonly during a launch's opening
 * window, where a snipe tax starting at 99% applies but its exact arithmetic is
 * not in the published source. A non-exact quote must be reconciled by
 * simulation before anything is shown to the user as final.
 */
export interface Quote {
  amountIn: bigint
  amountOut: bigint
  feeAmount: bigint
  creatorTaxAmount: bigint
  snipeTaxBps: bigint
  /** True when the buy would be clamped by the graduation cap and partly refunded. */
  partialFill: boolean
  exact: boolean
}

export interface LaunchParams {
  name: string
  symbol: string
  /** IPFS URI, e.g. "ipfs://bafk...". Uploaded by us before this is built. */
  logo: string
  description: string
  socials: Socials
  /** Zero address defaults to the caller. */
  creatorFeeRecipient: Address
  creatorTaxBps: number
  buybackEnabled: boolean
  /** Pin from previewLaunchEconomics(); zero waives the check. */
  expectedEconomics: Hex
  salt: Hex
}

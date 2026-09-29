import type { Address } from 'viem'
import type {
  CurveState,
  GraduationStatus,
  LaunchedToken,
  LaunchpadVersion,
  Quote,
  TokenMetadata,
} from '../types.js'

/**
 * The per-generation adapter interface (project rule 5).
 *
 * V1 and V2 have genuinely different mechanics - a Uniswap V3 position opened
 * at launch versus a bonding curve that graduates into Uniswap V4 - so there is
 * deliberately no single generic `buy`. Callers resolve a version first, then
 * work through that version's adapter. Operations a generation cannot support
 * return null or throw UnsupportedOperationError rather than being faked.
 */
export interface LaunchAdapter {
  readonly version: LaunchpadVersion
  readonly factory: Address

  /** The launch record, or null if this factory did not create the token. */
  getLaunchedToken(token: Address): Promise<LaunchedToken | null>

  /** Immutable on-chain metadata. */
  getTokenMetadata(token: Address): Promise<TokenMetadata>

  getGraduationStatus(token: Address): Promise<GraduationStatus>

  /** V2 only. Returns null for V1, which has no bonding curve. */
  getCurveState(token: Address): Promise<CurveState | null>

  /**
   * An off-chain buy quote. Check `exact` before presenting it as final:
   * project rule 4 requires simulation before any signature is requested.
   */
  quoteBuy(token: Address, quoteIn: bigint, recipient: Address): Promise<Quote>

  quoteSell(token: Address, tokensIn: bigint, recipient: Address): Promise<Quote>
}

export class UnsupportedOperationError extends Error {
  constructor(version: LaunchpadVersion, operation: string) {
    super(`${operation} is not supported on Launchpad ${version}`)
    this.name = 'UnsupportedOperationError'
  }
}

export class TokenNotFoundError extends Error {
  constructor(token: Address) {
    super(`${token} was not launched by any known Launchpad factory`)
    this.name = 'TokenNotFoundError'
  }
}

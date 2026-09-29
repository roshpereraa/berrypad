import type { Address, ContractFunctionName, PublicClient } from 'viem'
import { v2CurveAbi } from '../abi/v2Curve.js'
import { v2FactoryAbi } from '../abi/v2Factory.js'
import { v2TokenAbi } from '../abi/v2Token.js'
import { CONTRACTS, NATIVE_QUOTE } from '../config.js'
import * as curveMath from '../math/curve.js'
import {
  GraduationPhase,
  type CurveState,
  type GraduationStatus,
  type LaunchedToken,
  type Quote,
  type TokenMetadata,
} from '../types.js'
import type { LaunchAdapter } from './types.js'

/**
 * the launchpad: full supply minted to a per-launch constant-product bonding curve
 * that graduates into a locked full-range Uniswap V4 pool.
 *
 * This is the only generation open to new launches.
 */
export class LaunchpadV2Adapter implements LaunchAdapter {
  readonly version = 'v2' as const
  readonly factory: Address

  constructor(
    private readonly client: PublicClient,
    factory: Address = CONTRACTS.v2Factory,
  ) {
    this.factory = factory
  }

  async getLaunchedToken(token: Address): Promise<LaunchedToken | null> {
    const record = await this.client.readContract({
      address: this.factory,
      abi: v2FactoryAbi,
      functionName: 'getLaunchedToken',
      args: [token],
    })
    if (!record.exists) return null
    return {
      version: 'v2',
      address: record.token,
      deployer: record.deployer,
      curve: record.curve,
      pairToken: record.pairToken,
      creatorFeeRecipient: record.creatorFeeRecipient,
      factory: this.factory,
    }
  }

  async getTokenMetadata(token: Address): Promise<TokenMetadata> {
    const read = <T>(functionName: ContractFunctionName<typeof v2TokenAbi, 'view'>) =>
      this.client.readContract({
        address: token,
        abi: v2TokenAbi,
        functionName,
      }) as Promise<T>

    const [name, symbol, decimals, totalSupply, logo, description, socials] = await Promise.all([
      read<string>('name'),
      read<string>('symbol'),
      read<number>('decimals'),
      read<bigint>('totalSupply'),
      read<string>('logo'),
      read<string>('description'),
      read<readonly [string, string, string, string, string]>('socials'),
    ])

    return {
      address: token,
      name,
      symbol,
      decimals,
      totalSupply,
      logo,
      description,
      socials: {
        twitter: socials[0],
        telegram: socials[1],
        discord: socials[2],
        website: socials[3],
        farcaster: socials[4],
      },
    }
  }

  async getCurveState(token: Address): Promise<CurveState | null> {
    const record = await this.getLaunchedToken(token)
    if (!record?.curve) return null
    return this.readCurveState(record.curve)
  }

  /** Reads curve state directly, skipping the factory lookup. */
  async readCurveState(curve: Address): Promise<CurveState> {
    const read = <T>(functionName: ContractFunctionName<typeof v2CurveAbi, 'view'>) =>
      this.client.readContract({ address: curve, abi: v2CurveAbi, functionName }) as Promise<T>

    const [
      token,
      pairToken,
      isNativeQuote,
      reserves,
      realQuoteReserve,
      phantomQuote,
      sellableTokens,
      reservedTokens,
      graduationThreshold,
      feeBps,
      creatorTaxBps,
      graduated,
      readyToGraduate,
    ] = await Promise.all([
      read<Address>('token'),
      read<Address>('pairToken'),
      read<boolean>('isNativeQuote'),
      read<readonly [bigint, bigint]>('getReserves'),
      read<bigint>('realQuoteReserve'),
      read<bigint>('phantomQuote'),
      read<bigint>('sellableTokens'),
      read<bigint>('reservedTokens'),
      read<bigint>('graduationThreshold'),
      read<bigint>('feeBps'),
      read<bigint>('creatorTaxBps'),
      read<boolean>('graduated'),
      read<boolean>('readyToGraduate'),
    ])

    return {
      curve,
      token,
      pairToken,
      isNativeQuote,
      quoteReserve: reserves[0],
      tokenReserve: reserves[1],
      realQuoteReserve,
      phantomQuote,
      sellableTokens,
      reservedTokens,
      graduationThreshold,
      feeBps,
      creatorTaxBps,
      graduated,
      readyToGraduate,
    }
  }

  async getGraduationStatus(token: Address): Promise<GraduationStatus> {
    const record = await this.client.readContract({
      address: this.factory,
      abi: v2FactoryAbi,
      functionName: 'getLaunchedToken',
      args: [token],
    })
    if (!record.exists) {
      return {
        version: 'v2',
        graduated: false,
        raised: 0n,
        threshold: 0n,
        sellableTokens: null,
        phase: null,
      }
    }
    const phase = record.phase as GraduationPhase
    // Past graduation the curve is drained, so the swept amount is the raise.
    if (phase !== GraduationPhase.NotGraduated) {
      return {
        version: 'v2',
        graduated: true,
        raised: record.sweptQuote,
        threshold: record.graduationThreshold,
        sellableTokens: 0n,
        phase,
      }
    }
    const curve = await this.readCurveState(record.curve)
    return {
      version: 'v2',
      graduated: false,
      raised: curve.realQuoteReserve,
      threshold: record.graduationThreshold,
      sellableTokens: curve.sellableTokens,
      phase,
    }
  }

  /**
   * Off-chain buy quote.
   *
   * Returns `exact: false` whenever a snipe tax is live for `recipient`. The
   * deployed curve applies a tax that starts at 99% and is absent from the
   * published source, so no off-chain formula can be trusted inside that
   * window - the caller must simulate. Project rule 4 requires simulation
   * before signing regardless; this flag makes the display honest too.
   */
  async quoteBuy(token: Address, quoteIn: bigint, recipient: Address): Promise<Quote> {
    const state = await this.getCurveState(token)
    if (!state) throw new Error(`${token} has no V2 bonding curve`)
    const snipeTaxBps = await this.client.readContract({
      address: state.curve,
      abi: v2CurveAbi,
      functionName: 'currentSnipeTaxBps',
      args: [recipient],
    })

    const result = curveMath.quoteBuy({
      quoteIn,
      quoteReserve: state.quoteReserve,
      tokenReserve: state.tokenReserve,
      sellableTokens: state.sellableTokens,
      feeBps: state.feeBps,
      creatorTaxBps: state.creatorTaxBps,
    })

    return {
      amountIn: result.spent,
      amountOut: result.tokensOut,
      feeAmount: result.fee,
      creatorTaxAmount: result.creatorTax,
      snipeTaxBps,
      partialFill: result.partialFill,
      exact: snipeTaxBps === 0n,
    }
  }

  async quoteSell(token: Address, tokensIn: bigint, _recipient: Address): Promise<Quote> {
    const state = await this.getCurveState(token)
    if (!state) throw new Error(`${token} has no V2 bonding curve`)
    const result = curveMath.quoteSell({
      tokensIn,
      quoteReserve: state.quoteReserve,
      tokenReserve: state.tokenReserve,
      feeBps: state.feeBps,
      creatorTaxBps: state.creatorTaxBps,
    })
    return {
      amountIn: tokensIn,
      amountOut: result.quoteOut,
      feeAmount: result.fee,
      creatorTaxAmount: result.creatorTax,
      // The snipe tax applies to buys only.
      snipeTaxBps: 0n,
      partialFill: false,
      exact: true,
    }
  }

  /** True when this launch trades in native ETH rather than an ERC-20 quote asset. */
  static isNativeLaunch(pairToken: Address): boolean {
    return pairToken.toLowerCase() === NATIVE_QUOTE.toLowerCase()
  }
}

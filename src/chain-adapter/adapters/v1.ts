import type { Address, ContractFunctionName, PublicClient } from 'viem'
import { v1FactoryAbi } from '../abi/v1Factory.js'
import { v1TokenAbi } from '../abi/v1Token.js'
import { CONTRACTS } from '../config.js'
import type { CurveState, GraduationStatus, LaunchedToken, Quote, TokenMetadata } from '../types.js'
import { UnsupportedOperationError, type LaunchAdapter } from './types.js'

/**
 * Launchpad V1: a CREATE2 factory that mints a fixed-supply ERC-20 and opens a
 * one-sided Uniswap V3 position, locking the position NFT.
 *
 * Read-only in this app. Both V1 factories report launchEnabled() == false on
 * chain, so launching is closed; historical V1 tokens still trade on their
 * Uniswap V3 pools and we index and display them.
 *
 * There is no bonding curve here, and quoting goes through the V3 pool rather
 * than a closed-form curve - hence the deliberate absence of a shared generic
 * `buy` across generations (project rule 5).
 */
export class LaunchpadV1Adapter implements LaunchAdapter {
  readonly version = 'v1' as const
  readonly factory: Address

  constructor(
    private readonly client: PublicClient,
    factory: Address = CONTRACTS.v1Factory,
  ) {
    this.factory = factory
  }

  async getLaunchedToken(token: Address): Promise<LaunchedToken | null> {
    const record = await this.client.readContract({
      address: this.factory,
      abi: v1FactoryAbi,
      functionName: 'getLaunchedToken',
      args: [token],
    })
    if (!record.exists) return null
    return {
      version: 'v1',
      address: record.token,
      deployer: record.deployer,
      curve: null,
      pairToken: record.pairedToken,
      creatorFeeRecipient: null,
      factory: this.factory,
    }
  }

  async getTokenMetadata(token: Address): Promise<TokenMetadata> {
    const read = <T>(functionName: ContractFunctionName<typeof v1TokenAbi, 'view'>) =>
      this.client.readContract({ address: token, abi: v1TokenAbi, functionName }) as Promise<T>

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

  /**
   * V1 derives graduation from the paired-token principal actually locked in
   * its Uniswap V3 position, not from a curve. Direct donations to the pool do
   * not count, and a zero threshold disables graduation for that token.
   */
  async getGraduationStatus(token: Address): Promise<GraduationStatus> {
    const [pairedPrincipal, threshold, graduated] = await this.client.readContract({
      address: this.factory,
      abi: v1FactoryAbi,
      functionName: 'graduationStatus',
      args: [token],
    })
    return {
      version: 'v1',
      graduated,
      raised: pairedPrincipal,
      threshold,
      sellableTokens: null,
      phase: null,
    }
  }

  /** V1 has no bonding curve. */
  async getCurveState(_token: Address): Promise<CurveState | null> {
    return null
  }

  /**
   * V1 trades on a Uniswap V3 pool from block one, so quoting means a V3
   * quoter call, not curve maths. Phase 4 work; deliberately unimplemented
   * rather than approximated with the wrong formula.
   */
  async quoteBuy(_token: Address, _quoteIn: bigint, _recipient: Address): Promise<Quote> {
    throw new UnsupportedOperationError('v1', 'quoteBuy')
  }

  async quoteSell(_token: Address, _tokensIn: bigint, _recipient: Address): Promise<Quote> {
    throw new UnsupportedOperationError('v1', 'quoteSell')
  }

  /** The canonical Uniswap V3 pool this token trades against. */
  async getPool(token: Address): Promise<Address> {
    return this.client.readContract({
      address: token,
      abi: v1TokenAbi,
      functionName: 'liquidityPool',
    })
  }
}

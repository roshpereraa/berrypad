/**
 * What a coin launched here can be priced in.
 *
 * pump.fun only accepts a custom creator fee on coins priced in a token from
 * its approved list, so the custom-tax pair is the default. SOL stays
 * available for a coin with pump.fun's standard fee, paid in SOL.
 */
import { PublicKey } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'

export interface LaunchPair {
  id: 'WBTC' | 'SOL'
  label: string
  /** Mint, token program and decimals of what the curve is priced in. */
  mint: PublicKey
  tokenProgram: PublicKey
  decimals: number
  symbol: string
  /** Whether pump.fun lets the creator choose the fee for this pair. */
  customFee: boolean
}

/** Wrapped Bitcoin (Wormhole Portal), on pump.fun's approved quote list. */
export const WBTC_MINT = new PublicKey('3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh')

export const LAUNCH_PAIRS: LaunchPair[] = [
  {
    id: 'WBTC',
    label: 'WBTC · custom tax',
    mint: WBTC_MINT,
    tokenProgram: TOKEN_PROGRAM_ID,
    decimals: 8,
    symbol: 'WBTC',
    customFee: true,
  },
  {
    id: 'SOL',
    label: 'SOL · standard fee',
    mint: NATIVE_MINT,
    tokenProgram: TOKEN_PROGRAM_ID,
    decimals: 9,
    symbol: 'SOL',
    customFee: false,
  },
]

export const DEFAULT_PAIR = LAUNCH_PAIRS[0]!

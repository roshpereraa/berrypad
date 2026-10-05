import { PublicKey } from '@solana/web3.js'
import { Buffer } from 'buffer'

/**
 * Solana network configuration, in one place.
 *
 * Coins are launched and traded through pump.fun's own on-chain program, so
 * nothing here is ours to deploy: the program ids come from pump.fun's official
 * SDK and the only choices left are which RPC to read through and which
 * explorer to link to.
 */
/*
 * Plain strings on purpose: this module is loaded on every page, and pulling
 * the SDK in for two constants put pump.fun's SDK and Anchor in the bundle
 * every visitor downloads before anything could paint.
 */
export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
export const PUMP_AMM_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'

/**
 * Where the browser sends Solana RPC calls.
 *
 * By default that is this site's own /api/rpc, which fails over across
 * several upstreams: public Solana endpoints refuse many requests made
 * directly from browsers. Set SOLANA_RPC_URL (server-side, key stays private)
 * to put a dedicated endpoint first, or NEXT_PUBLIC_SOLANA_RPC_URL to have
 * browsers call a provider directly.
 */
export const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
  (typeof window !== 'undefined' ? `${window.location.origin}/api/rpc` : 'https://solana-rpc.publicnode.com')

/**
 * WebSocket endpoint for the live feed. Websockets cannot go through the
 * proxy, so this points at a public endpoint that accepts browser
 * connections; when it is silent the feed polls through the proxy instead.
 */
export const WS_URL = process.env.NEXT_PUBLIC_SOLANA_WS_URL?.trim() || 'wss://solana-rpc.publicnode.com'

export const EXPLORER = 'https://solscan.io'

export const explorerTx = (sig: string) => `${EXPLORER}/tx/${sig}`
export const explorerAccount = (addr: string) => `${EXPLORER}/account/${addr}`
export const explorerToken = (mint: string) => `${EXPLORER}/token/${mint}`

/** The coin on pump.fun's own site, for anyone who wants to cross-check. */
export const pumpFunCoin = (mint: string) => `https://pump.fun/coin/${mint}`

/** Every pump.fun coin is minted with 6 decimals and a 1B supply. */
export const TOKEN_DECIMALS = 6
export const LAMPORTS = 1_000_000_000n

/**
 * Every launch made here sends 0 SOL to this address. It costs nothing, but
 * it makes every Berrypad launch findable on chain by asking for this
 * address's transactions, so the home page can list the coins launched here
 * without a database.
 *
 * It is a program-derived address, so it has no private key and nobody - us
 * included - can spend from it or sign as it. That is what makes the list
 * worth trusting: anyone can send to an address they do not own, but the
 * marker only lands in a transaction that actually ran a Berrypad launch.
 *
 * Overridable so a fork keeps its own registry rather than filling this one.
 */
export const BERRYPAD_LAUNCH_REGISTRY = (() => {
  const override = process.env.NEXT_PUBLIC_BERRYPAD_LAUNCH_REGISTRY?.trim()
  if (override) return new PublicKey(override)
  return PublicKey.findProgramAddressSync(
    [Buffer.from('berrypad-launch-registry')],
    new PublicKey(PUMP_PROGRAM),
  )[0]
})()

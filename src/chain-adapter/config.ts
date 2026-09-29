/**
 * The single source of truth for chain and contract configuration.
 *
 * Project rule 9: no addresses, RPC URLs or chain config anywhere else in the
 * codebase. Everything is overridable by environment variable so a fork, a
 * private RPC or a future redeployment needs no code change.
 *
 * Every default below was verified against Robinhood Chain mainnet on
 * 2026-09-22. See docs/CONTRACTS.md for the provenance of each one.
 */
import type { Address } from 'viem'
import { getAddress } from 'viem'

/** Robinhood Chain mainnet. Project rule 2: every write is gated on this. */
export const ROBINHOOD_CHAIN_ID = 4663 as const
/** Robinhood Chain testnet. Launchpad is NOT deployed here - verified by eth_getCode. */
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630 as const

/**
 * Reads `NEXT_PUBLIC_<key>` first so the same module works in a Next.js client
 * bundle, then the bare `<key>` for the indexer and server code.
 */
function env(key: string): string | undefined {
  const scope = globalThis as { process?: { env?: Record<string, string | undefined> } }
  const bag = scope.process?.env
  if (!bag) return undefined
  return bag[`NEXT_PUBLIC_${key}`] ?? bag[key]
}

function envAddress(key: string, fallback: Address): Address {
  const raw = env(key)
  if (!raw) return fallback
  // Throws on a malformed override rather than silently sending funds astray.
  return getAddress(raw.trim())
}

function envUrlList(key: string, fallback: readonly string[]): readonly string[] {
  const raw = env(key)
  if (!raw) return fallback
  const urls = raw
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
  if (urls.length === 0) throw new Error(`${key} was set but contained no URLs`)
  for (const u of urls) {
    if (!/^(https?|wss?):\/\//.test(u)) throw new Error(`${key} contains a non-URL entry: ${u}`)
  }
  return urls
}

function envBigInt(key: string, fallback: bigint): bigint {
  const raw = env(key)
  if (!raw) return fallback
  return BigInt(raw.trim())
}

/**
 * Public RPCs, in failover order. All three were tested working.
 *
 * Known limits of these endpoints, both handled by the indexer:
 *  - pruned, not archive: historical eth_call / eth_getCode fail
 *  - eth_getLogs rejects any query matching more than 10,000 logs
 */
export const RPC_URLS = envUrlList('RH_RPC_URLS', [
  'https://rpc.mainnet.chain.robinhood.com',
  'https://robinhood-rpc.publicnode.com',
  'https://robinhood.drpc.org',
])

export const EXPLORER_URL = env('RH_EXPLORER_URL') ?? 'https://robinscan.io'

/** Hard limits of the public RPC, measured rather than assumed. */
export const RPC_LIMITS = {
  /** `eth_getLogs` errors with "logs matched by query exceeds limit of 10000". */
  maxLogsPerQuery: 10_000,
  /** Block span accepted per query when the result stays under the log cap. */
  maxBlockRange: envBigInt('RH_MAX_BLOCK_RANGE', 50_000n),
} as const

export const CONTRACTS = {
  /** LaunchpadV2LaunchFactory - the only generation open to new launches. */
  v2Factory: envAddress('RH_V2_FACTORY', '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'),
  /** LaunchpadLaunchFactory (V1). launchEnabled() == false; read/trade only. */
  v1Factory: envAddress('RH_V1_FACTORY', '0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB'),
  /** Older V1 factory, not named in the README but live and holding real tokens. */
  v1LegacyFactory: envAddress('RH_V1_LEGACY_FACTORY', '0x0c37a24F5D23A486FA692d1500881d698B1F77a4'),

  // --- V2 supporting contracts, each read back from a getter on the factory ---
  v2Locker: envAddress('RH_V2_LOCKER', '0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952'),
  v2MemeHook: envAddress('RH_V2_MEME_HOOK', '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044'),
  v2FeeEscrow: envAddress('RH_V2_FEE_ESCROW', '0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e'),
  v2BuybackVault: envAddress('RH_V2_BUYBACK_VAULT', '0x42df2a798f82289E177311362e8f5ccC45c1219c'),

  // --- Uniswap ---
  /** Uniswap V4 PoolManager (V2 graduated pools). */
  poolManager: envAddress('RH_POOL_MANAGER', '0x8366a39CC670B4001A1121B8F6A443A643e40951'),
  /** Uniswap V4 PositionManager. */
  positionManager: envAddress('RH_POSITION_MANAGER', '0x58daec3116aae6D93017bAAea7749052E8a04fA7'),
  /** Canonical Permit2. */
  permit2: envAddress('RH_PERMIT2', '0x000000000022D473030F116dDEE9F6B43aC78BA3'),
  /**
   * Uniswap Universal Router - the entrypoint for trading graduated V2 tokens.
   * Identified empirically: it is the dominant caller of PoolManager.swap, and
   * its poolManager() returns the same PoolManager the Launchpad factory points at.
   */
  universalRouter: envAddress('RH_UNIVERSAL_ROUTER', '0x8876789976dEcBfCbBbe364623C63652db8C0904'),
  /**
   * Launchpad launch-and-buy router: the factory's configured launchForwarder, used
   * when a creator takes an opening position in the same transaction.
   */
  v2LaunchRouter: envAddress('RH_V2_LAUNCH_ROUTER', '0xe33E9E479dF8802cb0866d5d05258bEc4cF62948'),

  /** Uniswap V3 SwapRouter - the trading venue for V1 tokens. */
  v3SwapRouter: envAddress('RH_V3_SWAP_ROUTER', '0xCaf681a66D020601342297493863E78C959E5cb2'),
  v3Factory: envAddress('RH_V3_FACTORY', '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA'),
  v3PositionManager: envAddress(
    'RH_V3_POSITION_MANAGER',
    '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3',
  ),

  /** WETH. The V1 pair asset; V2 native launches use the zero address instead. */
  weth: envAddress('RH_WETH', '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'),

  /**
   * Multicall3 at its canonical cross-chain address, confirmed deployed here.
   * Declaring it lets viem batch reads automatically, which turns a per-token
   * metadata backfill from thousands of eth_calls into a handful.
   */
  multicall3: envAddress('RH_MULTICALL3', '0xcA11bde05977b3631167028862bE2a173976CA11'),
} as const

/** A native-ETH V2 launch reports this as its pairToken. */
export const NATIVE_QUOTE: Address = '0x0000000000000000000000000000000000000000'

/**
 * Earliest block worth scanning per factory.
 *
 * The V2 value is where the first TokenLaunched activity was located by binary
 * search (~2026-08-04). Blocks are ~0.1s, so this is ~41.7M blocks behind head
 * and a full backfill is a deliberate choice, not a default - see
 * INDEXER_DEFAULTS.backfillBlocks.
 */
export const DEPLOYMENT_BLOCKS = {
  v2Factory: envBigInt('RH_V2_FACTORY_FROM_BLOCK', 27_808_485n),
  v1Factory: envBigInt('RH_V1_FACTORY_FROM_BLOCK', 27_808_485n),
  v1LegacyFactory: envBigInt('RH_V1_LEGACY_FACTORY_FROM_BLOCK', 27_808_485n),
} as const

export const INDEXER_DEFAULTS = {
  /**
   * How far back a fresh backfill reaches, in blocks. ~2.5M blocks is roughly
   * three days at 0.1s/block. Older tokens are filled in on demand instead.
   * Set RH_BACKFILL_BLOCKS=0 to go all the way to DEPLOYMENT_BLOCKS.
   */
  backfillBlocks: envBigInt('RH_BACKFILL_BLOCKS', 2_500_000n),
  /** Blocks left unindexed at the head, so a reorg cannot strand a cursor. */
  confirmations: envBigInt('RH_CONFIRMATIONS', 50n),
  pollIntervalMs: Number(env('RH_POLL_INTERVAL_MS') ?? 2_000),
} as const

export const CHAIN_CONFIG = {
  chainId: ROBINHOOD_CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: RPC_URLS,
  explorerUrl: EXPLORER_URL,
} as const

export function explorerTx(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`
}
export function explorerAddress(address: string): string {
  return `${EXPLORER_URL}/address/${address}`
}

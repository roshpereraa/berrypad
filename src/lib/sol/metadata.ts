'use client'

/**
 * Coin metadata: the name, ticker and URI written on chain, and the JSON that
 * URI points at (image, description, socials).
 *
 * Coins made by `create_v2` are Token-2022 mints carrying the metadata
 * extension; older coins use a Metaplex metadata account. Both are read.
 */
import { PublicKey } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, getTokenMetadata } from '@solana/spl-token'
import { getConnection } from './connection'
import { resolveImageUrls } from './format'

export interface UriMetadata {
  name?: string
  symbol?: string
  description?: string
  image?: string
  twitter?: string
  telegram?: string
  website?: string
  instagram?: string
}

const uriCache = new Map<string, Promise<UriMetadata | null>>()

async function fetchJson(url: string, ms: number): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(String(res.status))
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.slice(0, max) : undefined)

/** The off-chain JSON for a coin, trying each gateway in turn. Cached per URI. */
export function fetchUriMetadata(uri: string): Promise<UriMetadata | null> {
  if (!uri) return Promise.resolve(null)
  let known = uriCache.get(uri)
  if (!known) {
    known = (async () => {
      for (const url of resolveImageUrls(uri)) {
        try {
          const raw = (await fetchJson(url, 6_000)) as Record<string, unknown>
          return {
            name: str(raw.name, 64),
            symbol: str(raw.symbol, 16),
            description: str(raw.description, 1000),
            image: str(raw.image, 400),
            twitter: str(raw.twitter, 200),
            telegram: str(raw.telegram, 200),
            website: str(raw.website, 200),
            instagram: str(raw.instagram, 200),
          }
        } catch {
          /* next gateway */
        }
      }
      return null
    })()
    uriCache.set(uri, known)
  }
  return known
}

const METAPLEX = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')

function readBorshString(data: Uint8Array, offset: number): [string, number] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const len = view.getUint32(offset, true)
  const bytes = data.subarray(offset + 4, offset + 4 + len)
  return [new TextDecoder().decode(bytes).replace(/\0+$/, '').trim(), offset + 4 + len]
}

export interface OnchainMetadata {
  name: string
  symbol: string
  uri: string
}

/** Name, ticker and URI as written on chain for a pump.fun mint. */
export async function fetchOnchainMetadata(mint: PublicKey, tokenProgram: PublicKey): Promise<OnchainMetadata | null> {
  const connection = getConnection()
  if (tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
    const meta = await getTokenMetadata(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID).catch(() => null)
    if (meta) return { name: meta.name, symbol: meta.symbol, uri: meta.uri }
  }
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode('metadata'), METAPLEX.toBytes(), mint.toBytes()],
    METAPLEX,
  )
  const info = await connection.getAccountInfo(pda).catch(() => null)
  if (!info) return null
  try {
    // key(1) + update authority(32) + mint(32), then three borsh strings.
    let offset = 1 + 32 + 32
    const [name, a] = readBorshString(info.data, offset)
    offset = a
    const [symbol, b] = readBorshString(info.data, offset)
    offset = b
    const [uri] = readBorshString(info.data, offset)
    return { name, symbol, uri }
  } catch {
    return null
  }
}

export { solUsd, tokenUsd } from './price'

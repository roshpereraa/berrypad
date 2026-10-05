/**
 * The heavy half of the live feed: the Solana connection, pump.fun's event
 * decoder (which brings Anchor) and metadata reads. Loaded on demand by
 * feed.ts so the board can paint its cached snapshot first.
 */
export { PublicKey } from '@solana/web3.js'
export { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
export { getConnection } from './connection'
export { eventsFromLogs, eventsFromTransaction } from './events'
export { fetchOnchainMetadata, fetchUriMetadata } from './metadata'

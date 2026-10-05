/**
 * Which address lookup tables recent pump.fun launches use, and what they
 * contain. A lookup table lets a transaction reference an account in one byte
 * instead of 32, which is what keeps create plus first buy under Solana's
 * size limit. Read-only.
 */
import { Connection, PublicKey } from '@solana/web3.js'
import { MAYHEM_PROGRAM_ID } from '@pump-fun/pump-sdk'
import { eventsFromTransaction } from '@/lib/sol/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


export async function GET(): Promise<Response> {
  const conn = new Connection('https://solana-rpc.publicnode.com', 'confirmed')
  // Every create_v2 references the Mayhem program, so its history is mostly
  // launches; pump.fun's own history is a few seconds of trades.
  const sigs = await conn.getSignaturesForAddress(MAYHEM_PROGRAM_ID, { limit: 300 })
  const settled = sigs.filter((s) => !s.err && (s.blockTime ?? 0) < Date.now() / 1000 - 10).slice(0, 80)
  const tally = new Map<string, number>()
  let launches = 0
  for (let i = 0; i < settled.length; i += 8) {
    const txs = await Promise.all(
      settled
        .slice(i, i + 8)
        .map((s) => conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 }).catch(() => null)),
    )
    for (const tx of txs) {
      if (!tx || !eventsFromTransaction(tx).some((e) => e.kind === 'launch')) continue
      launches++
      const lookups = (tx.transaction.message as { addressTableLookups?: { accountKey: PublicKey }[] }).addressTableLookups ?? []
      for (const l of lookups) tally.set(l.accountKey.toBase58(), (tally.get(l.accountKey.toBase58()) ?? 0) + 1)
    }
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const tables = await Promise.all(
    top.map(async ([address, uses]) => {
      const table = await conn.getAddressLookupTable(new PublicKey(address)).catch(() => null)
      return {
        address,
        uses,
        active: table?.value?.isActive() ?? false,
        authority: table?.value?.state.authority?.toBase58() ?? null,
        addresses: table?.value?.state.addresses.map((a) => a.toBase58()) ?? [],
      }
    }),
  )
  return Response.json({ scanned: settled.length, launches, tables }, { headers: { 'cache-control': 'no-store' } })
}

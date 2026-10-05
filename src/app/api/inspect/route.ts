/**
 * Read-only forensic view of a wallet or a coin: its recent transactions,
 * the SOL each one moved for that address, and the pump.fun events in it.
 * Used to answer "where did my SOL / tokens go" from chain data alone.
 */
import { Connection, PublicKey } from '@solana/web3.js'
import { PUMP_SDK, bondingCurvePda } from '@pump-fun/pump-sdk'
import { eventsFromTransaction } from '@/lib/sol/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RPC = 'https://solana-rpc.publicnode.com'

export async function GET(request: Request): Promise<Response> {
  const address = new URL(request.url).searchParams.get('address') ?? ''
  let key: PublicKey
  try {
    key = new PublicKey(address)
  } catch {
    return Response.json({ error: 'Pass ?address=<wallet or mint>' }, { status: 400 })
  }
  const conn = new Connection(RPC, 'confirmed')

  // A coin: describe its curve and read the curve's history instead.
  const curveInfo = await conn.getAccountInfo(bondingCurvePda(key)).catch(() => null)
  const isCoin = Boolean(curveInfo)
  const coin = curveInfo
    ? (() => {
        const c = PUMP_SDK.decodeBondingCurve(curveInfo)
        return {
          creator: c.creator.toBase58(),
          complete: c.complete,
          realTokenReserves: c.realTokenReserves.toString(),
          realQuoteReserves: c.realQuoteReserves.toString(),
          tokenTotalSupply: c.tokenTotalSupply.toString(),
          isHolderReward: c.isHolderReward,
        }
      })()
    : null
  const target = isCoin ? bondingCurvePda(key) : key
  const balance = isCoin ? null : await conn.getBalance(key).catch(() => null)

  const sigs = await conn.getSignaturesForAddress(target, { limit: 25 })
  const rows = []
  for (const s of sigs) {
    const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 }).catch(() => null)
    const keys = tx
      ? [
          ...(tx.transaction.message.staticAccountKeys ?? []).map((k) => k.toBase58()),
          ...(tx.meta?.loadedAddresses?.writable ?? []).map((k) => k.toBase58()),
          ...(tx.meta?.loadedAddresses?.readonly ?? []).map((k) => k.toBase58()),
        ]
      : []
    const i = keys.indexOf(key.toBase58())
    const solChange =
      tx?.meta && i >= 0 ? ((tx.meta.postBalances[i] ?? 0) - (tx.meta.preBalances[i] ?? 0)) / 1e9 : null
    const events = tx
      ? eventsFromTransaction(tx).map((e) =>
          e.kind === 'trade'
            ? { kind: 'trade', side: e.isBuy ? 'buy' : 'sell', mint: e.mint, user: e.user, sol: Number(e.sol) / 1e9, tokens: Number(e.tokens) / 1e6 }
            : e.kind === 'launch'
              ? { kind: 'launch', mint: e.mint, name: e.name, symbol: e.symbol, creator: e.creator, user: e.user }
              : { kind: 'complete', mint: e.mint },
        )
      : []
    rows.push({
      signature: s.signature,
      time: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null,
      failed: Boolean(s.err),
      error: s.err ?? null,
      feePayer: keys[0] ?? null,
      solChange,
      events,
      logTail: s.err ? (tx?.meta?.logMessages ?? []).filter((l) => /Error|failed/.test(l)).slice(-3) : [],
    })
  }
  return Response.json({ address: key.toBase58(), isCoin, coin, solBalance: balance === null ? null : balance / 1e9, transactions: rows }, { headers: { 'cache-control': 'no-store' } })
}

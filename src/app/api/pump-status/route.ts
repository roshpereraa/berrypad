/**
 * What pump.fun allows right now, read from its Global and QuoteControl
 * accounts: whether coins may carry their own creator fee and up to what
 * rate, whether holder-reward coins are on, and which tokens coins may be
 * priced in. The launch form reads the same accounts in the browser; this is
 * the server-side view, for checking a deployment.
 */
import { Connection } from '@solana/web3.js'
import { OnlinePumpSdk, PUMP_PROGRAM_ID } from '@pump-fun/pump-sdk'
import { eventsFromTransaction } from '@/lib/sol/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UPSTREAMS = [
  ...(process.env.SOLANA_RPC_URL ?? '').split(',').map((u) => u.trim()).filter((u) => /^https:\/\//.test(u)),
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet-beta.solana.com',
]

export async function GET(): Promise<Response> {
  const errors: string[] = []
  for (const url of UPSTREAMS) {
    try {
      const sdk = new OnlinePumpSdk(new Connection(url, 'confirmed'))
      const connection = new Connection(url, 'confirmed')
      const [global, quotes] = await Promise.all([sdk.fetchGlobal(), sdk.fetchSupportedQuoteMints()])
      // Decode a handful of live transactions with the site's own decoder.
      // Signatures a few seconds old, so every node behind the RPC has them.
      const sigs = await connection.getSignaturesForAddress(PUMP_PROGRAM_ID, { limit: 400 })
      const picked = sigs.filter((s) => !s.err && (s.blockTime ?? 0) < Date.now() / 1000 - 8).slice(0, 8)
      let missing = 0
      let failed = 0
      const txs = []
      for (const s of picked) {
        const tx = await connection
          .getTransaction(s.signature, { maxSupportedTransactionVersion: 0 })
          .catch(() => {
            failed++
            return null
          })
        if (!tx) missing++
        txs.push(tx)
      }
      const events = txs.flatMap((tx) => eventsFromTransaction(tx))

      // The live stream: how many pump.fun log messages arrive over the
      // websocket in three seconds.
      let wsMessages = 0
      let wsError: string | null = null
      try {
        const ws = new Connection(url, { commitment: 'confirmed', wsEndpoint: 'wss://solana-rpc.publicnode.com' })
        const id = ws.onLogs(PUMP_PROGRAM_ID, () => wsMessages++, 'confirmed')
        await new Promise((r) => setTimeout(r, 3_000))
        await ws.removeOnLogsListener(id)
      } catch (e) {
        wsError = String(e).slice(0, 160)
      }
      const sample = {
        transactions: txs.filter(Boolean).length,
        missing,
        failed,
        signaturesScanned: sigs.length,
        wsMessages,
        wsError,
        events: events.length,
        kinds: events.reduce<Record<string, number>>((acc, e) => ((acc[e.kind] = (acc[e.kind] ?? 0) + 1), acc), {}),
        first: events.slice(0, 3).map((e) =>
          e.kind === 'trade'
            ? { kind: e.kind, mint: e.mint, isBuy: e.isBuy, sol: e.sol.toString(), tokens: e.tokens.toString(), realToken: e.realToken.toString(), isSol: e.isSol }
            : e.kind === 'launch'
              ? { kind: e.kind, mint: e.mint, name: e.name, symbol: e.symbol, uri: e.uri }
              : { kind: e.kind, mint: e.mint },
        ),
      }
      return Response.json(
        {
          rpc: new URL(url).host,
          creatorFeeConfigurable: global.creatorFeeConfigurable,
          maxConfigurableCreatorFeeBps: global.maxConfigurableCreatorFeeBps.toString(),
          isHolderRewardEnabled: global.isHolderRewardEnabled,
          createV2Enabled: global.createV2Enabled,
          quoteMintCount: quotes.length,
          sample,
        },
        { headers: { 'cache-control': 'no-store' } },
      )
    } catch (e) {
      errors.push(`${new URL(url).host}: ${String(e).slice(0, 140)}`)
    }
  }
  return Response.json({ error: 'No upstream answered.', errors }, { status: 503 })
}

/**
 * Solana JSON-RPC, served from this origin with failover.
 *
 * Public Solana endpoints refuse or rate-limit requests that come straight
 * from browsers, which left the site unable to read the chain at all. This
 * route forwards each call to the first upstream that answers: a private
 * endpoint when SOLANA_RPC_URL is set (kept server-side, so its key never
 * reaches a browser), then free public endpoints. A refusal, rate limit or
 * outage at one upstream moves the call to the next instead of failing it.
 *
 * Only the methods the site uses are forwarded, so this cannot be borrowed as
 * a general-purpose open relay for heavy calls.
 */
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const PUBLIC_UPSTREAMS = [
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet-beta.solana.com',
  'https://api.mainnet.solana.com',
]

function upstreams(): string[] {
  const own = (process.env.SOLANA_RPC_URL ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter((u) => /^https:\/\//.test(u))
  return [...own, ...PUBLIC_UPSTREAMS]
}

/**
 * Upstreams in the order to try them. A private endpoint always goes first;
 * the free ones are rotated per request so no single one takes every call
 * and rate-limits the whole site.
 */
function ordered(): string[] {
  const own = (process.env.SOLANA_RPC_URL ?? '').split(',').map((u) => u.trim()).filter((u) => /^https:\/\//.test(u))
  const free = [...PUBLIC_UPSTREAMS]
  const shift = Math.floor(Math.random() * free.length)
  return [...own, ...free.slice(shift), ...free.slice(0, shift)]
}

const ALLOWED = new Set([
  'getAccountInfo',
  'getBalance',
  'getBlockHeight',
  'getFeeForMessage',
  'getLatestBlockhash',
  'getMultipleAccounts',
  'getParsedAccountInfo',
  'getRecentPrioritizationFees',
  'getSignatureStatuses',
  'getSignaturesForAddress',
  'getSlot',
  'getTokenAccountBalance',
  'getTokenAccountsByOwner',
  'getTokenLargestAccounts',
  'getTokenSupply',
  'getTransaction',
  'getMinimumBalanceForRentExemption',
  'getEpochInfo',
  'getGenesisHash',
  'getVersion',
  'getHealth',
  'isBlockhashValid',
  'sendTransaction',
  'simulateTransaction',
])

const MAX_BODY = 256 * 1024
const MAX_BATCH = 40
/** Errors that mean "this upstream will not serve you", not "your call is wrong". */
const RETRYABLE_RPC_CODES = new Set([-32005, -32007, -32009, -32010, -32014, -32015, -32016, -32603, 429, 403])

interface RpcCall {
  jsonrpc?: string
  id?: unknown
  method?: string
  params?: unknown
}

function bad(message: string, status = 400): Response {
  return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message } }, { status })
}

function shouldFailOver(body: unknown): boolean {
  const items = Array.isArray(body) ? body : [body]
  return items.some((item) => {
    const err = (item as { error?: { code?: number; message?: string } })?.error
    if (!err) return false
    if (err.code !== undefined && RETRYABLE_RPC_CODES.has(err.code)) return true
    return /rate limit|too many|forbidden|not allowed|disabled|unavailable/i.test(err.message ?? '')
  })
}

async function forward(payload: string, timeoutMs = 12_000): Promise<{ body: unknown; upstream: string } | null> {
  // Two passes: a moment's rate limit at every upstream usually clears.
  for (let pass = 0; pass < 2; pass++) {
    const hit = await forwardOnce(payload, timeoutMs)
    if (hit) return hit
    await new Promise((r) => setTimeout(r, 600))
  }
  return null
}

/**
 * A signed transaction goes to every upstream at once: each forwards it to
 * the network on its own, which is what gets it into a block when leaders
 * are dropping traffic. The first answer is returned.
 */
async function broadcast(payload: string): Promise<{ body: unknown; upstream: string } | null> {
  const attempts = ordered().map(async (url) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await res.json()) as { result?: unknown }
    if (!res.ok || body.result === undefined) throw new Error('not accepted')
    return { body: body as unknown, upstream: new URL(url).host }
  })
  try {
    return await Promise.any(attempts)
  } catch {
    return forward(payload)
  }
}

async function forwardOnce(payload: string, timeoutMs: number): Promise<{ body: unknown; upstream: string } | null> {
  for (const url of ordered()) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) continue
      const body = (await res.json()) as unknown
      // A batch answered with a single error object means batching is refused.
      if (payload.trimStart().startsWith('[') && !Array.isArray(body)) continue
      if (shouldFailOver(body)) continue
      return { body, upstream: new URL(url).host }
    } catch {
      /* unreachable or timed out: try the next one */
    }
  }
  return null
}

export async function POST(request: Request): Promise<Response> {
  const text = await request.text()
  if (text.length > MAX_BODY) return bad('Request too large.', 413)
  let parsed: RpcCall | RpcCall[]
  try {
    parsed = JSON.parse(text) as RpcCall | RpcCall[]
  } catch {
    return bad('Invalid JSON.')
  }
  const calls = Array.isArray(parsed) ? parsed : [parsed]
  if (calls.length === 0 || calls.length > MAX_BATCH) return bad('Batch size not allowed.')
  for (const call of calls) {
    if (!call || typeof call.method !== 'string' || !ALLOWED.has(call.method)) {
      return bad(`Method not allowed: ${String(call?.method)}`, 403)
    }
  }

  const isSend = !Array.isArray(parsed) && parsed.method === 'sendTransaction'
  let result = isSend ? await broadcast(text) : await forward(text)
  // No upstream took the batch whole: send its calls one at a time instead.
  if (!result && Array.isArray(parsed)) {
    const parts = await Promise.all(parsed.map((call) => forward(JSON.stringify(call))))
    if (parts.every(Boolean)) {
      result = { body: parts.map((p) => p!.body), upstream: parts[0]!.upstream }
    }
  }
  if (!result) {
    return Response.json(
      {
        jsonrpc: '2.0',
        id: Array.isArray(parsed) ? null : (parsed.id ?? null),
        error: { code: -32099, message: 'Every Solana RPC upstream is busy. Retrying shortly.' },
      },
      { status: 503 },
    )
  }
  return Response.json(result.body, {
    headers: { 'cache-control': 'no-store', 'x-rpc-upstream': result.upstream },
  })
}

/**
 * Health check: which upstreams answer from this server right now, and
 * whether each can serve the heaviest read the site makes.
 */
export async function GET(): Promise<Response> {
  const pump = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
  const checks = await Promise.all(
    upstreams().map(async (url) => {
      const host = new URL(url).host
      const started = Date.now()
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify([
            { jsonrpc: '2.0', id: 1, method: 'getSlot' },
            { jsonrpc: '2.0', id: 2, method: 'getSignaturesForAddress', params: [pump, { limit: 2 }] },
          ]),
          signal: AbortSignal.timeout(8_000),
        })
        const body = (await res.json().catch(() => null)) as { id: number; result?: unknown; error?: { message?: string } }[] | null
        const slot = body?.find((b) => b.id === 1)
        const sigs = body?.find((b) => b.id === 2)
        return {
          host,
          status: res.status,
          ms: Date.now() - started,
          slot: slot?.result ?? slot?.error?.message ?? null,
          signatures: Array.isArray(sigs?.result) ? (sigs!.result as unknown[]).length : (sigs?.error?.message ?? null),
        }
      } catch (e) {
        return { host, status: 0, ms: Date.now() - started, error: String(e).slice(0, 160) }
      }
    }),
  )
  return Response.json({ upstreams: checks }, { headers: { 'cache-control': 'no-store' } })
}

/**
 * Jupiter swap routing, served from this origin.
 *
 * Used to turn SOL into the token a coin is priced in (and back) for coins
 * launched with a custom creator fee. GET returns a quote, POST returns the
 * swap instructions for a quote; the browser builds, simulates and signs the
 * transaction itself, so nothing here ever holds a key. A Jupiter API key in
 * JUP_API_KEY is used when set and kept server-side.
 */
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

function hosts(): { base: string; headers: Record<string, string> }[] {
  const key = (process.env.JUP_API_KEY ?? '').trim()
  return [
    ...(key ? [{ base: 'https://api.jup.ag/swap/v1', headers: { 'x-api-key': key } }] : []),
    { base: 'https://lite-api.jup.ag/swap/v1', headers: {} },
  ]
}

async function forward(path: string, init: RequestInit): Promise<Response> {
  let last: Response | null = null
  for (const host of hosts()) {
    try {
      const res = await fetch(`${host.base}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), ...host.headers },
        cache: 'no-store',
      })
      if (res.ok) {
        return new Response(await res.text(), {
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        })
      }
      last = res
      // A 4xx about the request itself will not improve at another host.
      if (res.status === 400 || res.status === 422) break
    } catch {
      /* next host */
    }
  }
  const detail = last ? await last.text().catch(() => '') : ''
  return Response.json(
    { error: 'The swap route is unavailable right now.', detail: detail.slice(0, 300) },
    { status: last?.status && last.status < 500 ? last.status : 502 },
  )
}

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const inputMint = url.searchParams.get('inputMint') ?? ''
  const outputMint = url.searchParams.get('outputMint') ?? ''
  const amount = url.searchParams.get('amount') ?? ''
  const slippageBps = url.searchParams.get('slippageBps') ?? '100'
  if (!ADDRESS.test(inputMint) || !ADDRESS.test(outputMint) || !/^\d{1,20}$/.test(amount) || !/^\d{1,4}$/.test(slippageBps)) {
    return Response.json({ error: 'Bad swap request.' }, { status: 400 })
  }
  const query = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps,
    // Keeps the route small enough to fit one transaction with room to spare.
    maxAccounts: '40',
    restrictIntermediateTokens: 'true',
  })
  return forward(`/quote?${query}`, { method: 'GET' })
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text()
  if (body.length > 64 * 1024) return Response.json({ error: 'Too large.' }, { status: 413 })
  return forward('/swap-instructions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
}

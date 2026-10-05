/**
 * Coin metadata upload, proxied to pump.fun's IPFS endpoint.
 *
 * pump.fun's launch flow pins the image and a metadata JSON through
 * `pump.fun/api/ipfs` and writes the returned URI on chain. That endpoint does
 * not accept cross-origin browser requests, so the form posts here and this
 * route forwards it unchanged. Nothing is stored on this server.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 5 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

const text = (form: FormData, key: string, max: number) =>
  String(form.get(key) ?? '').trim().slice(0, max)

export async function POST(request: Request): Promise<Response> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'Expected a multipart form.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof Blob)) return Response.json({ error: 'An image is required.' }, { status: 400 })
  if (!TYPES.includes(file.type)) return Response.json({ error: 'Use a PNG, JPG, WEBP or GIF.' }, { status: 400 })
  if (file.size > MAX_BYTES) return Response.json({ error: 'The image is over 5 MB.' }, { status: 400 })

  const name = text(form, 'name', 32)
  const symbol = text(form, 'symbol', 10)
  if (!name || !symbol) return Response.json({ error: 'Name and ticker are required.' }, { status: 400 })

  const upstream = new FormData()
  upstream.append('file', file, (file as File).name || 'image')
  upstream.append('name', name)
  upstream.append('symbol', symbol)
  upstream.append('description', text(form, 'description', 1000))
  upstream.append('twitter', text(form, 'twitter', 200))
  upstream.append('telegram', text(form, 'telegram', 200))
  upstream.append('website', text(form, 'website', 200))
  upstream.append('instagram', text(form, 'instagram', 200))
  upstream.append('showName', 'true')

  try {
    const res = await fetch('https://pump.fun/api/ipfs', {
      method: 'POST',
      body: upstream,
      headers: { Accept: 'application/json', Origin: 'https://pump.fun', Referer: 'https://pump.fun/create' },
      signal: AbortSignal.timeout(30_000),
    })
    const body = await res.text()
    if (!res.ok) {
      return Response.json(
        { error: `pump.fun refused the upload (${res.status}). Try again in a moment.`, detail: body.slice(0, 200) },
        { status: 502 },
      )
    }
    const parsed = JSON.parse(body) as { metadataUri?: string; metadata?: { image?: string } }
    if (!parsed.metadataUri) {
      return Response.json({ error: 'pump.fun returned no metadata URI.' }, { status: 502 })
    }
    return Response.json({ metadataUri: parsed.metadataUri, image: parsed.metadata?.image ?? null })
  } catch (e) {
    return Response.json(
      { error: 'Could not reach pump.fun to store the metadata. Try again in a moment.', detail: String(e).slice(0, 200) },
      { status: 502 },
    )
  }
}

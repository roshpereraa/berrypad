/**
 * Token logo uploads.
 *
 * Uploaded straight from the creator's browser to a public Supabase Storage
 * bucket using the project's PUBLISHABLE key, which is designed to be exposed
 * in client bundles. No secret is involved, and the deployment needs no extra
 * configuration.
 *
 * The bucket independently enforces the 5 MB cap and the image-only MIME list,
 * so the checks here are for a useful error message, not for security.
 */
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ozqhlrvnelhfgwohmxhk.supabase.co'
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_VAnTK5C1HvNcj6oXwH00DQ_thC4Sesi'
const BUCKET = 'token-logos'

export const LOGO_RULES = {
  maxBytes: 5 * 1024 * 1024,
  types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const,
  /** Aggregators crop to a square tile; below this it looks broken. */
  minEdge: 200,
  recommendedEdge: 512,
}

export interface LogoCheck {
  ok: boolean
  error?: string
  warning?: string
  width?: number
  height?: number
}

/** Reads the image's real dimensions rather than trusting the file name. */
export function inspectLogo(file: File): Promise<LogoCheck> {
  return new Promise((resolve) => {
    if (!LOGO_RULES.types.includes(file.type as (typeof LOGO_RULES.types)[number])) {
      resolve({ ok: false, error: 'Use a PNG, JPG, WEBP or GIF.' })
      return
    }
    if (file.size > LOGO_RULES.maxBytes) {
      resolve({ ok: false, error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.` })
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { naturalWidth: w, naturalHeight: h } = img
      if (Math.min(w, h) < LOGO_RULES.minEdge) {
        resolve({ ok: false, error: `Image is ${w}x${h}. Use at least ${LOGO_RULES.minEdge}x${LOGO_RULES.minEdge}.`, width: w, height: h })
        return
      }
      const ratio = w / h
      resolve({
        ok: true,
        width: w,
        height: h,
        warning:
          ratio < 0.95 || ratio > 1.05
            ? `Image is ${w}x${h}. Listings crop to a square, so a square image avoids cropping.`
            : undefined,
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ ok: false, error: 'That file could not be read as an image.' })
    }
    img.src = url
  })
}

/** Uploads and returns the public URL to store on chain. */
export async function uploadLogo(file: File): Promise<string> {
  const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'
  // Content-addressed enough to avoid collisions without needing a database.
  const key = `4663/${crypto.randomUUID()}.${ext}`
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': file.type,
      'x-upsert': 'false',
    },
    body: file,
  })
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status}): ${(await res.text()).slice(0, 160)}`)
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`
}

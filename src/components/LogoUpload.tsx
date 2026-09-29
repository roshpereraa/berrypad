'use client'

import { useRef, useState } from 'react'
import { inspectLogo, uploadLogo } from '@/lib/storage'

/**
 * Pick a file, see it, upload it, get back the URL that goes on chain.
 *
 * The URL is what the contract stores, so it is surfaced rather than hidden -
 * a creator can paste their own IPFS URI instead if they would rather not
 * depend on our hosting.
 */
export function LogoUpload({
  value,
  onChange,
}: {
  value: string
  onChange: (url: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const handle = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setWarning(null)
    const check = await inspectLogo(file)
    if (!check.ok) {
      setError(check.error ?? 'That image cannot be used.')
      return
    }
    setWarning(check.warning ?? null)
    setPreview(URL.createObjectURL(file))
    setBusy(true)
    try {
      onChange(await uploadLogo(file))
    } catch (e) {
      setError((e as Error).message)
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/5 text-[10px] text-[var(--color-muted)] transition-colors hover:border-[var(--color-blue)]"
        >
          {preview || value ? (
            <img src={preview ?? value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center px-2 text-center">
              Click to upload
            </span>
          )}
          {busy ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/70">
              Uploading…
            </span>
          ) : null}
        </button>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[11px] text-[var(--color-muted)]">
            Square PNG, JPG, WEBP or GIF. At least 200×200, 512×512 recommended, under 5 MB.
            Listings crop to a square tile.
          </p>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="…or paste an image URL / ipfs:// URI"
            className="w-full rounded-lg px-2 py-1 font-mono text-[11px]"
          />
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void handle(e.target.files?.[0])}
      />

      {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
      {warning ? <p className="text-[11px] text-amber-400">{warning}</p> : null}
    </div>
  )
}

'use client'

import { useRef, useState } from 'react'

export const IMAGE_RULES = {
  maxBytes: 5 * 1024 * 1024,
  types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  minEdge: 200,
}

/** Reads the real dimensions rather than trusting the file name. */
function inspect(file: File): Promise<{ ok: boolean; error?: string; warning?: string }> {
  return new Promise((resolve) => {
    if (!IMAGE_RULES.types.includes(file.type)) return resolve({ ok: false, error: 'Use a PNG, JPG, WEBP or GIF.' })
    if (file.size > IMAGE_RULES.maxBytes) {
      return resolve({ ok: false, error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.` })
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { naturalWidth: w, naturalHeight: h } = img
      if (Math.min(w, h) < IMAGE_RULES.minEdge) {
        return resolve({ ok: false, error: `Image is ${w}×${h}. Use at least ${IMAGE_RULES.minEdge}×${IMAGE_RULES.minEdge}.` })
      }
      const ratio = w / h
      resolve({ ok: true, warning: ratio < 0.95 || ratio > 1.05 ? 'pump.fun shows coins as squares, so this will be cropped.' : undefined })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ ok: false, error: 'That file could not be read as an image.' })
    }
    img.src = url
  })
}

/**
 * Pick the coin image. It is held in the browser until launch, then pinned to
 * IPFS through pump.fun with the rest of the metadata.
 */
export function LogoUpload({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const take = async (f: File | undefined) => {
    if (!f) return
    setError(null)
    setWarning(null)
    const check = await inspect(f)
    if (!check.ok) {
      setError(check.error ?? 'That image cannot be used.')
      return
    }
    setWarning(check.warning ?? null)
    setPreview(URL.createObjectURL(f))
    onChange(f)
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void take(e.dataTransfer.files[0])
        }}
        className={`group flex w-full items-center gap-4 rounded-2xl border border-dashed p-4 text-left transition-colors ${
          dragging ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line-strong)] hover:border-[var(--accent)]'
        }`}
      >
        <span className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--surface-3)]">
          {preview && file ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-[var(--muted)]" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{file ? file.name : 'Drop an image or click to choose'}</span>
          <span className="mt-1 block text-xs leading-relaxed text-[var(--muted)]">
            Square PNG, JPG, WEBP or GIF, at least 200×200, under 5 MB.
          </span>
          {file ? <span className="mt-2 inline-block text-xs text-[var(--accent-hi)]">Change image</span> : null}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept={IMAGE_RULES.types.join(',')}
        className="hidden"
        onChange={(e) => void take(e.target.files?.[0])}
      />
      {error ? <p className="mt-2 text-xs text-[#ffb3bd]">{error}</p> : null}
      {warning && !error ? <p className="mt-2 text-xs text-[var(--gold)]">{warning}</p> : null}
    </div>
  )
}

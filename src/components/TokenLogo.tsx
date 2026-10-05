'use client'

import { useMemo, useState } from 'react'
import { resolveImageUrls } from '@/lib/sol/format'

/** Initials as a stable gradient, so a coin without art still looks deliberate. */
function hue(seed: string): number {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 360
}

/** Coin art, walking IPFS gateways on error and falling back to initials. */
export function TokenLogo({
  logo,
  symbol,
  size = 40,
  fill = false,
  rounded = 'rounded-xl',
}: {
  logo: string | null | undefined
  symbol: string | null | undefined
  size?: number
  fill?: boolean
  rounded?: string
}) {
  const candidates = useMemo(() => resolveImageUrls(logo), [logo])
  const [index, setIndex] = useState(0)
  const url = candidates[index]
  const label = (symbol || '?').slice(0, 2).toUpperCase()
  const h = hue(symbol || '?')

  if (!url) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center font-semibold text-white/90 ${
          fill ? 'absolute inset-0 text-3xl' : `${rounded} text-xs`
        }`}
        style={{
          ...(fill ? {} : { width: size, height: size }),
          background: `linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${(h + 50) % 360} 70% 30%))`,
        }}
      >
        {label}
      </div>
    )
  }

  return (
    <img
      key={url}
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setIndex((i) => i + 1)}
      className={fill ? 'absolute inset-0 h-full w-full object-cover' : `shrink-0 ${rounded} bg-[var(--surface-3)] object-cover`}
      style={fill ? undefined : { width: size, height: size }}
    />
  )
}

'use client'

import { useMemo, useState } from 'react'
import { resolveLogoUrls } from '@/chain-adapter'

/**
 * Token art, with gateway fallback.
 *
 * Creator-supplied images live on IPFS more often than not, and no single
 * public gateway is reliable — the one previously hard-coded here started
 * returning 429 and took most token art down with it. So this walks the
 * candidate list on error and only shows initials once every option is spent.
 */
export function TokenLogo({
  logo,
  symbol,
  size = 40,
  fill = false,
}: {
  logo: string | null
  symbol: string | null
  size?: number
  fill?: boolean
}) {
  const candidates = useMemo(() => resolveLogoUrls(logo), [logo])
  const [index, setIndex] = useState(0)
  const url = candidates[index]
  const initials = (symbol ?? '?').slice(0, 3).toUpperCase()

  if (!url) {
    return (
      <div
        className={`flex items-center justify-center bg-white/5 font-semibold text-[var(--color-muted)] ${
          fill ? 'absolute inset-0 text-base tracking-tight' : 'shrink-0 rounded-xl text-[10px]'
        }`}
        style={fill ? undefined : { width: size, height: size }}
      >
        {initials}
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
      className={
        fill
          ? 'absolute inset-0 h-full w-full object-cover'
          : 'shrink-0 rounded-xl bg-white/5 object-cover'
      }
      style={fill ? undefined : { width: size, height: size }}
    />
  )
}

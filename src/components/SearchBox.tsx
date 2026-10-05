'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** An address opens directly; anything else searches the live feed. */
export function SearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const [value, setValue] = useState(params.get('q') ?? '')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const q = value.trim()
        if (!q) return
        router.push(BASE58.test(q) ? `/token?address=${q}` : `/search?q=${encodeURIComponent(q)}`)
      }}
      className="relative w-full"
    >
      <svg
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search coin, ticker or address"
        aria-label="Search coins"
        className="h-9 w-full pl-8 pr-3 text-sm"
      />
    </form>
  )
}

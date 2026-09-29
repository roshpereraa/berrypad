'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

export function SearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const [value, setValue] = useState(params.get('q') ?? '')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const q = value.trim()
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`)
      }}
      className="w-full"
    >
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search name, ticker, or address"
        aria-label="Search tokens"
        className="w-full rounded-lg px-3 py-1.5 text-sm placeholder:text-[var(--color-muted)]"
      />
    </form>
  )
}

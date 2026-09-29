import { Suspense } from 'react'
import { TokenView } from '@/components/TokenView'

export const metadata = { title: 'Token — Berrypad' }

/**
 * A single static route that takes the address as a query parameter.
 *
 * A dynamic /token/[address] segment cannot be statically exported without
 * enumerating every token at build time, and there is no build-time list when
 * the chain is the only source.
 */
export default function TokenPage() {
  return (
    <Suspense fallback={<div className="card p-8 text-sm text-[var(--color-muted)]">Loading…</div>}>
      <TokenView />
    </Suspense>
  )
}

import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="py-12 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        That token is not in the range read, or the address was not launched on this launchpad.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm underline">
        ← Back to all tokens
      </Link>
    </div>
  )
}

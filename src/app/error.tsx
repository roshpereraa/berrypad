'use client'

/**
 * What a visitor sees when a page throws while rendering.
 *
 * Next's own fallback is a bare line of text that tells nobody anything and
 * leaves the site looking dead. This keeps the page on brand, offers a retry
 * that re-renders without a full reload, and - deliberately - prints the
 * error itself. A launchpad that silently white-screens is worse than one
 * that admits what broke, and the message is the first thing anyone
 * reporting the fault will be asked for.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <div className="card p-8">
        <h1 className="text-xl font-semibold">Something broke on this page</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
          The chain is unaffected — nothing here holds your keys or funds. Retry below, and if it
          keeps happening, send us the detail underneath.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={reset} className="btn-primary px-5 py-2 text-sm">
            Try again
          </button>
          <a href="/" className="pill px-5 py-2 text-sm">
            Back to the launchpad
          </a>
        </div>

        <pre className="num mt-5 max-h-60 overflow-auto rounded-xl border border-[var(--color-down)]/25 bg-black/60 p-3 text-[11px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-[var(--color-down)]">
          {error.message || 'No message'}
          {error.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>
      </div>
    </div>
  )
}

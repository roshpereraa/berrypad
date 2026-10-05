'use client'

/**
 * The last line of defence: a throw in the root layout itself.
 *
 * error.tsx sits inside the layout, so it never runs when the header, the
 * providers or the wallet adapter are what failed - exactly the case that
 * blanks every page at once. This replaces the whole document, so it carries
 * its own styling and leans on nothing that might be the thing that broke.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: '#000',
          color: '#effaf4',
          minHeight: '100vh',
          margin: 0,
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 640, width: '100%' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Berrypad failed to start</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#7c9488', marginTop: 8 }}>
            The chain is unaffected — nothing here holds your keys or funds. Retry below, and if it
            keeps happening, send us the detail underneath.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <button
              onClick={reset}
              style={{
                background: '#19d98f',
                color: '#00150c',
                border: 0,
                borderRadius: 999,
                padding: '9px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 999,
                padding: '9px 20px',
                fontSize: 14,
                color: '#effaf4',
                textDecoration: 'none',
              }}
            >
              Reload the launchpad
            </a>
          </div>
          <pre
            style={{
              marginTop: 20,
              padding: 12,
              maxHeight: 240,
              overflow: 'auto',
              borderRadius: 12,
              border: '1px solid rgba(255,107,107,0.25)',
              background: 'rgba(0,0,0,0.6)',
              color: '#ff6b6b',
              fontSize: 11,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {error.message || 'No message'}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
        </div>
      </body>
    </html>
  )
}

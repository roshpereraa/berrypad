import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Logo } from '@/components/Logo'
import { NavPill } from '@/components/NavPill'
import { NAV } from '@/lib/nav'
import { Providers } from '@/components/Providers'
import { SearchBox } from '@/components/SearchBox'
import { CONTRACT_ADDRESS, ContractAddress } from '@/components/ContractAddress'
import './globals.css'

export const metadata = {
  title: 'Berrypad — the launchpad for AI-agent tokens',
  description:
    'Launch and trade coins on Solana through pump.fun. Bonding curves that graduate onto PumpSwap, read live from the chain in your browser.',
}

/** The project's X account, linked from the header and the footer. */
const X_URL = 'https://x.com/Berrypad3'

function XIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.22-6.82-5.96 6.82H1.68l7.73-8.84L1.25 2.25h6.82l4.71 6.23 5.46-6.23Zm-1.16 17.52h1.83L7.01 4.13H5.04l12.04 15.64Z" />
    </svg>
  )
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>
          <header className="bar sticky top-0 z-30">
            <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3">
              <Link href="/" className="shrink-0">
                <Logo size={28} withWordmark />
              </Link>
              <div className="ml-6 hidden md:block">
                <NavPill />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <div className="hidden xl:block">
                  <ContractAddress compact />
                </div>
                <a
                  href={X_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Berrypad on X"
                  className="pill hidden h-8 w-8 place-items-center text-[var(--color-muted)] hover:text-[var(--color-ink)] sm:grid"
                >
                  <XIcon />
                </a>
                <div className="hidden w-56 lg:block">
                  <Suspense fallback={null}>
                    <SearchBox />
                  </Suspense>
                </div>
                <ConnectWallet />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 px-4 pb-2 md:hidden">
              <NavPill />
              {CONTRACT_ADDRESS ? <ContractAddress compact /> : null}
            </div>
          </header>

          <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>

          <footer className="mt-20 border-t border-[var(--color-line)] px-4 pb-10 pt-10">
            <div className="mx-auto max-w-[1400px]">
              <div className="grid gap-8 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div className="lg:col-span-2">
                  <Logo size={24} withWordmark />
                  <p className="mt-3 max-w-sm leading-relaxed text-[var(--color-muted)]">
                    Launch the coin. Understand the history behind every launch. Berrypad never
                    holds keys or funds — every action is signed by your own wallet.
                  </p>
                  <div className="mt-4">
                    <ContractAddress />
                  </div>
                </div>
                <div>
                  <div className="label mb-3">Explore</div>
                  <ul className="space-y-2">
                    {NAV.map(([href, label]) => (
                      <li key={href}>
                        <Link href={href} className="hover:text-[var(--accent)]">
                          {label}
                        </Link>
                      </li>
                    ))}
                    <li>
                      <Link href="/legal/privacy" className="hover:text-[var(--accent)]">
                        Privacy
                      </Link>
                    </li>
                  </ul>
                </div>
                <div>
                  <div className="label mb-3">Stay connected</div>
                  <a
                    href={X_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-[var(--accent)]"
                  >
                    <XIcon size={12} /> @Berrypad3
                  </a>
                  <p className="mt-3 text-[var(--color-muted)]">Built on public onchain data.</p>
                </div>
              </div>
              <div className="mt-10 flex flex-wrap justify-between gap-3 border-t border-[var(--color-line)] pt-5 text-[11px] text-[var(--color-muted)]">
                <span>© {new Date().getFullYear()} Berrypad</span>
                <span>
                  Not financial advice. Tokens are volatile and can lose all value; transactions
                  are irreversible.
                </span>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  )
}

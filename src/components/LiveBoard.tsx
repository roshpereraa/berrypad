'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { explorerAddress, explorerTx, formatAmount } from '@/chain-adapter'
import {
  fetchLaunches,
  fetchTrades,
  fetchTraderBoard,
  type BoardEntry,
  type ChainToken,
  type ChainTrade,
} from '@/lib/chain'
import { TokenLogo } from './TokenLogo'
import { Ticker } from './Ticker'
import { Identicon } from './Identicon'
import { Logo } from './Logo'
import { SwirlField } from './SwirlField'
import { LaunchVideos } from './LaunchVideos'
import { ContractAddressHero } from './ContractAddress'
import { shortAddress } from '@/lib/display'
import { readCache, writeCache } from '@/lib/cache'

function pct(raised: bigint, threshold: bigint) {
  if (threshold <= 0n) return 0
  const bps = (raised * 10_000n) / threshold
  return Math.min(Number(bps > 10_000n ? 10_000n : bps) / 100, 100)
}

type Sort = 'trending' | 'raised' | 'new'

/**
 * The launchpad, read live from the chain.
 *
 * Launches are the page: a grid of curves you can open and trade. The feed
 * and the trader board sit beside it to answer "what just happened" and "who
 * is active". Every figure is a chain read; nothing is modelled or filled in.
 */
export function LiveBoard() {
  const [tokens, setTokens] = useState<ChainToken[] | null>(null)
  const [trades, setTrades] = useState<ChainTrade[] | null>(null)
  const [board, setBoard] = useState<BoardEntry[] | null>(null)
  // Kept per source: a healthy trade read must not clear a real launch failure.
  const [errors, setErrors] = useState<{ launches?: string; trades?: string; board?: string }>({})
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)

  const [feed, setFeed] = useState<'all' | 'buys' | 'sells'>('all')
  const [sort, setSort] = useState<Sort>('trending')

  useEffect(() => {
    let alive = true

    // Show the last good snapshot at once, then refresh behind it.
    const cachedTokens = readCache<ChainToken[]>('launches')
    const cachedTrades = readCache<ChainTrade[]>('trades')
    const cachedBoard = readCache<BoardEntry[]>('board')
    if (cachedTokens) setTokens(cachedTokens.data)
    if (cachedTrades) setTrades(cachedTrades.data)
    if (cachedBoard) setBoard(cachedBoard.data)
    if (cachedTokens || cachedTrades) {
      setUpdatedAt(Math.max(cachedTokens?.at ?? 0, cachedTrades?.at ?? 0))
    }

    const load = () => {
      const settle = (key: 'launches' | 'trades' | 'board', message?: string) => {
        if (!alive) return
        setErrors((e) => ({ ...e, [key]: message }))
        if (!message) setUpdatedAt(Date.now())
      }
      const fail = (key: 'launches' | 'trades' | 'board') => (e: unknown) => {
        const err = e as { shortMessage?: string; message?: string }
        settle(key, String(err?.shortMessage || err?.message || e).slice(0, 420))
      }

      // Each panel paints the moment its own read lands.
      void fetchLaunches().then((v) => {
        if (alive) setTokens(v)
        writeCache('launches', v)
        settle('launches')
      }, fail('launches'))

      void fetchTrades().then((v) => {
        if (alive) setTrades(v)
        writeCache('trades', v)
        settle('trades')
      }, fail('trades'))

      void fetchTraderBoard().then((v) => {
        if (alive) setBoard(v)
        writeCache('board', v)
        settle('board')
      }, fail('board'))
    }

    load()
    const timer = setInterval(load, 20_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [attempt])

  const error = errors.launches ?? errors.trades ?? errors.board ?? null
  const traders = new Set((trades ?? []).map((t) => t.trader.toLowerCase())).size
  const graduating = (tokens ?? []).filter((t) => pct(t.raised, t.threshold) >= 50).length

  /** Curve -> token, so a fill is labelled with what was traded and in what. */
  const byCurve = useMemo(
    () => new Map((tokens ?? []).map((t) => [t.curve.toLowerCase(), t])),
    [tokens],
  )

  const shownTrades = (trades ?? []).filter((t) =>
    feed === 'all' ? true : feed === 'buys' ? t.side === 'buy' : t.side === 'sell',
  )

  const shownTokens = [...(tokens ?? [])].sort((a, b) => {
    if (sort === 'trending') return pct(b.raised, b.threshold) - pct(a.raised, a.threshold)
    if (sort === 'new') return b.launchedAtBlock > a.launchedAtBlock ? 1 : -1
    return b.raised > a.raised ? 1 : -1
  })

  return (
    <>
      <section className="hero mb-4 min-h-[460px] px-6 py-10 sm:px-12 sm:py-16">
        <SwirlField />
        <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-xl">
            <div className="label flex items-center gap-2">
              <span className="dot-live" />
              Live · Robinhood Chain
              {updatedAt ? <span>· {new Date(updatedAt).toLocaleTimeString()}</span> : null}
            </div>
            <h1 className="mt-5 text-4xl font-medium leading-[1.02] tracking-tight sm:text-6xl">
              Launch it.
              <br />
              Watch it <span className="glow-text">grow</span>.
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[var(--color-ink)]/80">
              Berrypad is the launchpad for AI-agent tokens on Robinhood Chain. Every coin starts
              on a bonding curve and graduates into a locked Uniswap pool — all read live from the
              chain, straight in your browser.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/launch" className="btn-primary px-6 py-3 text-sm">
                Create a coin
              </Link>
              <a href="#launches" className="pill px-6 py-3 text-sm font-medium backdrop-blur">
                Explore launches
              </a>
            </div>
            <ContractAddressHero />
          </div>
          <div className="hidden justify-self-center lg:block">
            <div className="drop-shadow-[0_0_40px_rgba(25,217,143,0.55)]">
              <Logo size={168} />
            </div>
          </div>
        </div>

        <dl className="relative mt-12 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Launches', tokens?.length],
            ['Graduating', tokens ? graduating : undefined],
            ['Fills', trades?.length],
            ['Traders', trades ? traders : undefined],
          ].map(([k, v]) => (
            <div
              key={k as string}
              className="rounded-2xl border border-white/10 bg-black/55 px-4 py-3 backdrop-blur"
            >
              <dt className="label">{k}</dt>
              <dd className="num mt-1 text-2xl font-semibold">
                {v === undefined ? '—' : String(v).padStart(2, '0')}
              </dd>
            </div>
          ))}
        </dl>

        {error ? (
          <div className="relative mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-down)]/30 bg-black/70 p-3 text-xs text-[var(--color-down)]">
            <span className="leading-relaxed">{error}</span>
            <button
              onClick={() => setAttempt((n) => n + 1)}
              className="pill px-3 py-1 text-[11px] text-[var(--color-ink)]"
            >
              Try again
            </button>
          </div>
        ) : null}
      </section>

      <div className="-mx-4 mb-6">
        <Ticker tokens={tokens} />
      </div>

      <div id="launches" className="grid scroll-mt-24 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <header className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight">Launches</h2>
            <span className="label flex items-center gap-1.5">
              {tokens ? <span className="dot-live" /> : null}
              {tokens ? `${tokens.length} live curves` : 'reading…'}
            </span>
            <div className="seg ml-auto">
              {(['trending', 'raised', 'new'] as const).map((k) => (
                <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>
                  {k === 'trending' ? 'Trending' : k === 'raised' ? 'Top raised' : 'Newest'}
                </button>
              ))}
            </div>
          </header>

          {!tokens ? (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="shimmer h-[150px] rounded-2xl" />
              ))}
            </div>
          ) : shownTokens.length === 0 ? (
            <div className="card p-10 text-center text-sm text-[var(--color-muted)]">
              No launches in this window yet.{' '}
              <Link href="/launch" className="text-[var(--accent)] hover:underline">
                Be the first →
              </Link>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {shownTokens.map((t) => {
                const p = pct(t.raised, t.threshold)
                return (
                  <li key={t.address} className="min-w-0">
                    <Link href={`/token?address=${t.address}`} className="tile block p-4">
                      <div className="flex items-start gap-3">
                        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10">
                          <TokenLogo logo={t.logo} symbol={t.symbol} fill />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">
                            {t.name || t.symbol}
                          </span>
                          <span className="label block">${t.symbol || '???'}</span>
                          <span className="label mt-1 block normal-case tracking-normal">
                            by {shortAddress(t.deployer)}
                          </span>
                        </span>
                        {p >= 100 ? (
                          <span className="stamp !border-[var(--accent)]/50 !text-[var(--accent)]">
                            Graduated
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-2">
                        <span>
                          <span className="label block">Raised</span>
                          <span className="num text-sm">
                            {Number(formatAmount(t.raised, t.quoteDecimals)).toFixed(3)}{' '}
                            <span className="text-[var(--color-muted)]">{t.quoteSymbol}</span>
                          </span>
                        </span>
                        <span className="num text-sm text-[var(--accent-hi)]">
                          {p.toFixed(1)}%
                        </span>
                      </div>
                      <span className="meter mt-2 block">
                        <span style={{ width: `${Math.max(p, 1)}%` }} />
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title="Live feed"
            right={trades ? 'streaming' : 'reading…'}
            live={!!trades}
            control={
              <div className="seg">
                {(['all', 'buys', 'sells'] as const).map((k) => (
                  <button key={k} aria-pressed={feed === k} onClick={() => setFeed(k)}>
                    {k === 'all' ? 'All' : k === 'buys' ? 'Buys' : 'Sells'}
                  </button>
                ))}
              </div>
            }
          >
            {!trades ? (
              <Skeleton rows={7} />
            ) : shownTrades.length === 0 ? (
              <Empty>No {feed} in this window.</Empty>
            ) : (
              <ul className="scroller max-h-[440px] space-y-1 pr-1">
                {shownTrades.map((t) => {
                  const tok = byCurve.get(t.curve.toLowerCase())
                  return (
                    <li
                      key={`${t.txHash}-${t.logIndex}`}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                    >
                      <Identicon address={t.trader} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <a
                            href={explorerAddress(t.trader)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-[13px] font-medium hover:text-[var(--accent-hi)]"
                          >
                            {shortAddress(t.trader)}
                          </a>
                          <span className={`stamp ${t.side === 'buy' ? 'chip-up' : 'chip-down'}`}>
                            {t.side === 'buy' ? 'Bought' : 'Sold'}
                          </span>
                        </div>
                        <div className="label mt-0.5 truncate normal-case tracking-normal">
                          {tok ? (
                            <Link
                              href={`/token?address=${tok.address}`}
                              className="hover:text-[var(--accent-hi)]"
                            >
                              ${tok.symbol}
                            </Link>
                          ) : (
                            <>curve {shortAddress(t.curve)}</>
                          )}
                        </div>
                      </div>
                      <span className="num shrink-0 text-[12px]">
                        {tok
                          ? `${Number(formatAmount(t.quote, tok.quoteDecimals)).toFixed(4)} ${tok.quoteSymbol}`
                          : Number(formatAmount(t.quote, 18)).toFixed(4)}
                      </span>
                      <a
                        href={explorerTx(t.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-[var(--color-muted)] hover:text-[var(--accent-hi)]"
                        aria-label="View transaction"
                      >
                        ↗
                      </a>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Top traders" right={board ? `${board.length} ranked` : 'reading…'} live={!!board}>
            <div className="label mb-2 flex items-center justify-between">
              <span>Ranked on ETH volume</span>
              <span>~9k blocks</span>
            </div>
            {!board ? (
              <Skeleton rows={5} />
            ) : board.length === 0 ? (
              <Empty>No trading in this window.</Empty>
            ) : (
              <ol className="scroller max-h-[340px] space-y-0.5 pr-1">
                {board.map((e, i) => (
                  <li key={e.wallet}>
                    <a
                      href={explorerAddress(e.wallet)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-white/[0.05]"
                    >
                      <span
                        className={`num grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-semibold ${
                          i === 0
                            ? 'bg-[var(--accent)] text-black'
                            : 'bg-white/[0.06] text-[var(--color-muted)]'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <Identicon address={e.wallet} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">
                          {shortAddress(e.wallet)}
                        </span>
                        <span className="label block normal-case tracking-normal">
                          {e.trades} fills · {e.buys}B / {e.sells}S
                        </span>
                      </span>
                      <span className="num shrink-0 text-[13px] text-[var(--accent-hi)]">
                        {Number(formatAmount(e.ethVolume, 18)).toFixed(3)}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      <LaunchVideos />

      <HowItWorks />
    </>
  )
}

/* ------------------------------------------------------------------ */

const STEPS = [
  [
    'Create a coin',
    'Name, ticker, logo and a line on what it is. One transaction deploys it through the launchpad factory — no presale, no allocation.',
  ],
  [
    'Trade the curve',
    'The full supply sits on a bonding curve from the first block. Anyone can buy or sell against it, and the price moves with every fill.',
  ],
  [
    'Graduate',
    'When the curve sells out it migrates into a Uniswap V4 pool whose liquidity is locked forever. Creators keep earning their fee.',
  ],
] as const

function HowItWorks() {
  return (
    <section className="mt-16">
      <h2 className="text-center text-lg text-[var(--color-muted)]">How it works</h2>
      <ol className="mt-8 grid gap-4 md:grid-cols-3">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="card p-6">
            <div className="num text-sm text-[var(--accent)]">0{i + 1}</div>
            <h3 className="mt-3 text-xl font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Panel({
  title,
  right,
  live,
  control,
  children,
}: {
  title: string
  right?: string
  live?: boolean
  control?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="card flex min-w-0 flex-col p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <span className="label ml-auto flex items-center gap-1.5">
          {live ? <span className="dot-live" /> : null}
          {right}
        </span>
      </header>
      {control ? <div className="mb-3">{control}</div> : null}
      {children}
    </section>
  )
}

function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="shimmer h-11 rounded-xl" />
      ))}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-xs text-[var(--color-muted)]">{children}</p>
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useFeed } from '@/lib/sol/useFeed'
import { useSolUsd } from '@/lib/sol/useSolUsd'
import type { Coin } from '@/lib/sol/feed'
import { explorerAccount, explorerTx } from '@/lib/sol/config'
import { compact, formatSol, shortAddress, timeAgo, usd } from '@/lib/sol/format'
import { useBerrypadLaunches } from '@/lib/sol/launches'
import { CoinRow, CoinRowSkeleton } from './CoinRow'
import { BerrypadLaunchRow } from './BerrypadLaunchRow'
import { Ticker } from './Ticker'
import { Identicon } from './Identicon'
import { Logo } from './Logo'
import { SwirlField } from './SwirlField'
import { LaunchVideos } from './LaunchVideos'
import { ContractAddressHero } from './ContractAddress'

const recency = (c: Coin) => Math.max(c.lastTradeAt, c.createdAt ?? 0)

/**
 * The launchpad, read live from Solana.
 *
 * Coins launched here come first - they are the only column on the page that
 * is ours - and then the trenches follow a coin's life across pump.fun as a
 * whole: new, graduating, graduated. The fills and the busiest wallets sit
 * below. Every figure is decoded from the pump.fun program's own events in
 * this browser; nothing is modelled or filled in.
 */
export function LiveBoard() {
  const feed = useFeed()
  const solPrice = useSolUsd()
  const ours = useBerrypadLaunches(20)
  const [side, setSide] = useState<'all' | 'buys' | 'sells'>('all')
  const [boardMode, setBoardMode] = useState<'volume' | 'flow'>('volume')
  const [, tick] = useState(0)

  useEffect(() => {
    // Ages ("12s") keep counting between events.
    const t = setInterval(() => tick((n) => n + 1), 5_000)
    return () => clearInterval(t)
  }, [])

  const coins = useMemo(() => [...feed.coins.values()], [feed])

  const fresh = useMemo(
    () =>
      coins
        .filter((c) => c.createdAt !== null && !c.complete)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, 20),
    [coins],
  )
  const graduating = useMemo(
    () =>
      coins
        .filter((c) => !c.complete && c.progress >= 35)
        .sort((a, b) => b.progress - a.progress)
        .slice(0, 20),
    [coins],
  )
  const graduated = useMemo(
    () => coins.filter((c) => c.complete).sort((a, b) => recency(b) - recency(a)).slice(0, 20),
    [coins],
  )
  const hot = useMemo(
    () => [...coins].filter((c) => c.symbol).sort((a, b) => Number(b.volumeSol - a.volumeSol)).slice(0, 24),
    [coins],
  )
  const symbols = useMemo(() => new Map(coins.map((c) => [c.mint, c.symbol])), [coins])

  const trades = feed.trades.filter((t) => (side === 'all' ? true : side === 'buys' ? t.isBuy : !t.isBuy))
  const traders = useMemo(
    () =>
      [...feed.traders.values()]
        .sort((a, b) =>
          boardMode === 'volume'
            ? Number(b.solIn + b.solOut - (a.solIn + a.solOut))
            : Number(b.solOut - b.solIn - (a.solOut - a.solIn)),
        )
        .slice(0, 25),
    [feed, boardMode],
  )

  const volume = useMemo(
    () => [...feed.traders.values()].reduce((sum, t) => sum + t.solIn + t.solOut, 0n),
    [feed],
  )
  const loading = feed.coins.size === 0 && feed.status !== 'error'

  const live =
    feed.status === 'live' ? 'Live · Solana' : feed.status === 'polling' ? 'Live · polling' : 'Connecting…'

  return (
    <>
      <section className="hero mb-4 min-h-[460px] px-6 py-10 sm:px-12 sm:py-16">
        <SwirlField />
        <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-xl">
            <div className="label flex items-center gap-2">
              <span
                className={
                  feed.status === 'live' || feed.status === 'polling'
                    ? 'dot-live'
                    : 'h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--gold)]'
                }
              />
              {live}
            </div>
            <h1 className="mt-5 text-4xl font-medium leading-[1.02] tracking-tight sm:text-6xl">
              Launch it.
              <br />
              Watch it <span className="glow-text">grow</span>.
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[var(--color-ink)]/80">
              Berrypad launches coins through pump.fun&apos;s own program on Solana. Every coin
              starts on a bonding curve and graduates onto PumpSwap — all read live from the
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
            ['Launched here', ours.launches.length ? compact(ours.launches.length, 1) : '—'],
            ['Coins seen', feed.coins.size ? compact(feed.coins.size, 1) : '—'],
            ['Fills', feed.events ? compact(feed.events, 1) : '—'],
            [
              'Volume',
              volume > 0n
                ? solPrice
                  ? usd((Number(volume) / 1e9) * solPrice)
                  : `${formatSol(volume, 1)} SOL`
                : '—',
            ],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-white/10 bg-black/55 px-4 py-3 backdrop-blur">
              <dt className="label">{k}</dt>
              <dd className="num mt-1 text-2xl font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        {feed.status === 'error' && feed.coins.size === 0 ? (
          <p className="relative mt-6 flex items-center gap-2 text-xs text-[var(--muted)]">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--muted)] border-t-transparent" />
            Solana is busy right now. Reconnecting automatically.
          </p>
        ) : null}
      </section>

      <div className="-mx-4 mb-6">
        <Ticker coins={hot} solPrice={solPrice} />
      </div>

      <div id="launches" className="grid scroll-mt-24 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <Column
          title="Launched on Berrypad"
          hint="coins made here"
          count={ours.launches.length}
          loading={ours.status === 'loading'}
          accent
          empty={
            ours.status === 'error' ? (
              <>Could not read the launch registry just now. It retries on its own.</>
            ) : (
              <>
                No coins have been launched here yet.{' '}
                <Link href="/launch" className="text-[var(--accent)] hover:underline">
                  Be the first →
                </Link>
              </>
            )
          }
          note="Read from the launch registry on chain — every coin created through this site, newest first."
        >
          {ours.launches.map((l) => {
            // Once a coin trades, the feed knows its reserves and curve, so show
            // the full row. Until then the registry is all there is to show.
            const livecoin = feed.coins.get(l.mint)
            return livecoin ? (
              <CoinRow key={l.mint} coin={livecoin} solPrice={solPrice} />
            ) : (
              <BerrypadLaunchRow key={l.mint} launch={l} />
            )
          })}
        </Column>

        <Column title="New" hint="just launched" count={fresh.length} loading={loading}>
          {fresh.map((c) => (
            <CoinRow
              key={c.mint}
              coin={c}
              solPrice={solPrice}
              fresh={(c.createdAt ?? 0) > Date.now() / 1000 - 8}
            />
          ))}
        </Column>
        <Column title="Graduating" hint="35%+ of the curve sold" count={graduating.length} loading={loading}>
          {graduating.map((c) => (
            <CoinRow key={c.mint} coin={c} solPrice={solPrice} />
          ))}
        </Column>
        <Column title="Graduated" hint="moved to PumpSwap" count={graduated.length} loading={loading}>
          {graduated.map((c) => (
            <CoinRow key={c.mint} coin={c} solPrice={solPrice} />
          ))}
        </Column>
      </div>

      <LaunchVideos />

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="card p-4 sm:p-5">
          <header className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold">Live trades</h2>
            <span className="dot-live" />
            <div className="seg ml-auto">
              {(['all', 'buys', 'sells'] as const).map((k) => (
                <button key={k} aria-pressed={side === k} onClick={() => setSide(k)}>
                  {k === 'all' ? 'All' : k === 'buys' ? 'Buys' : 'Sells'}
                </button>
              ))}
            </div>
          </header>
          {feed.trades.length === 0 ? (
            <Rows />
          ) : (
            <div className="scroller max-h-[560px] pr-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="label text-left">
                    <th className="pb-2 font-normal">Trader</th>
                    <th className="pb-2 font-normal">Coin</th>
                    <th className="pb-2 text-right font-normal">SOL</th>
                    <th className="hidden pb-2 text-right font-normal sm:table-cell">Age</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {trades.slice(0, 50).map((t) => (
                    <tr key={`${t.sig}-${t.index}`} className="border-t border-[var(--line)]">
                      <td className="py-2 pr-2">
                        <a
                          href={explorerAccount(t.user)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 hover:text-[var(--accent-hi)]"
                        >
                          <Identicon address={t.user} size={24} />
                          <span className="num truncate">{shortAddress(t.user)}</span>
                        </a>
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className={`mr-2 inline-block w-9 text-xs font-semibold ${
                            t.isBuy ? 'text-[var(--up)]' : 'text-[var(--down)]'
                          }`}
                        >
                          {t.isBuy ? 'BUY' : 'SELL'}
                        </span>
                        <Link
                          href={`/token?address=${t.mint}`}
                          className="font-medium hover:text-[var(--accent-hi)]"
                        >
                          ${symbols.get(t.mint) || shortAddress(t.mint, 3, 3)}
                        </Link>
                      </td>
                      <td
                        className={`num py-2 text-right ${t.isBuy ? 'text-[var(--up)]' : 'text-[var(--down)]'}`}
                      >
                        {t.isSol ? formatSol(t.sol, 3) : '—'}
                      </td>
                      <td className="num hidden py-2 text-right text-[var(--muted)] sm:table-cell">
                        {timeAgo(t.timestamp)}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <a
                          href={explorerTx(t.sig)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--faint)] hover:text-[var(--accent-hi)]"
                          aria-label="View on Solscan"
                        >
                          ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card p-4 sm:p-5">
          <header className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold">Leaderboard</h2>
            <div className="seg ml-auto">
              <button aria-pressed={boardMode === 'volume'} onClick={() => setBoardMode('volume')}>
                Volume
              </button>
              <button aria-pressed={boardMode === 'flow'} onClick={() => setBoardMode('flow')}>
                Net SOL
              </button>
            </div>
          </header>
          <p className="mb-3 text-xs text-[var(--muted)]">
            Wallets trading pump.fun since this page opened. Net SOL is SOL out minus SOL in on
            these fills, not profit on open positions.
          </p>
          {traders.length === 0 ? (
            <Rows />
          ) : (
            <ol className="scroller max-h-[500px] space-y-1 pr-1">
              {traders.map((t, i) => {
                const net = t.solOut - t.solIn
                return (
                  <li key={t.wallet}>
                    <a
                      href={explorerAccount(t.wallet)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04]"
                    >
                      <span
                        className={`num grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[11px] font-semibold ${
                          i === 0
                            ? 'bg-[var(--gold)] text-black'
                            : i < 3
                              ? 'bg-[var(--accent)] text-black'
                              : 'bg-white/[0.06] text-[var(--muted)]'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <Identicon address={t.wallet} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="num block truncate text-sm font-medium">
                          {shortAddress(t.wallet)}
                        </span>
                        <span className="block text-xs text-[var(--muted)]">
                          {t.buys}B · {t.sells}S · {t.coins} coin{t.coins === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className="num shrink-0 text-right text-sm">
                        {boardMode === 'volume' ? (
                          <>
                            {formatSol(t.solIn + t.solOut, 2)}
                            <span className="ml-1 text-xs text-[var(--muted)]">SOL</span>
                          </>
                        ) : (
                          <span className={net >= 0n ? 'text-[var(--up)]' : 'text-[var(--down)]'}>
                            {net >= 0n ? '+' : ''}
                            {formatSol(net, 2)}
                          </span>
                        )}
                      </span>
                    </a>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  )
}

function Column({
  title,
  hint,
  count,
  loading,
  children,
  accent = false,
  empty,
  note,
}: {
  title: string
  hint: string
  count: number
  loading: boolean
  children: React.ReactNode
  /** Rings the column in emerald. Used for the one column that is ours. */
  accent?: boolean
  /** What to say when there is nothing to show. */
  empty?: React.ReactNode
  /** A line under the header, for a column that needs to explain itself. */
  note?: string
}) {
  return (
    <section
      className={`card flex min-w-0 flex-col p-3 sm:p-4 ${
        accent ? 'border-[var(--accent)]/35 shadow-[0_0_40px_-18px_var(--glow)]' : ''
      }`}
    >
      <header className="mb-3 flex items-baseline gap-2 px-1">
        <h2 className={`text-base font-semibold ${accent ? 'text-[var(--accent-hi)]' : ''}`}>{title}</h2>
        <span className="text-xs text-[var(--muted)]">{hint}</span>
        <span className="num ml-auto text-xs text-[var(--faint)]">{count}</span>
      </header>
      {note ? <p className="mb-3 px-1 text-[11px] leading-relaxed text-[var(--faint)]">{note}</p> : null}
      <div className="scroller max-h-[640px] space-y-2 pr-1">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <CoinRowSkeleton key={i} />)
        ) : count === 0 ? (
          <p className="px-2 py-14 text-center text-sm text-[var(--muted)]">
            {empty ?? 'Nothing here yet. Coins appear as they happen.'}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

function Rows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="shimmer h-9 rounded-lg" />
      ))}
    </div>
  )
}

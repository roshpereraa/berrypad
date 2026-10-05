'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { PublicKey } from '@solana/web3.js'
import { bondingCurvePda } from '@pump-fun/pump-sdk'
import { getConnection, describeRpcError } from '@/lib/sol/connection'
import { fetchCoinState, curveProgress, loadProtocol, marketCapSol, priceInSol, type CoinState } from '@/lib/sol/pump'
import { fetchOnchainMetadata, fetchUriMetadata, tokenUsd, type UriMetadata } from '@/lib/sol/metadata'
import { coinTrades } from '@/lib/sol/history'
import type { TradeEvent } from '@/lib/sol/events'
import { useFeed } from '@/lib/sol/useFeed'
import { useSolUsd } from '@/lib/sol/useSolUsd'
import { explorerAccount, explorerToken, explorerTx, pumpFunCoin, TOKEN_DECIMALS } from '@/lib/sol/config'
import { compact, formatAmount, isSolanaAddress, shortAddress, timeAgo, usd } from '@/lib/sol/format'
import { Identicon } from './Identicon'
import dynamic from 'next/dynamic'
import { TokenLogo } from './TokenLogo'
import { TradePanel } from './TradePanel'

/** The charting library loads after the page, not before it. */
const PriceChart = dynamic(() => import('./PriceChart').then((m) => m.PriceChart), {
  ssr: false,
  loading: () => <div className="shimmer h-[400px] rounded-2xl" />,
})

interface Loaded {
  coin: CoinState
  name: string
  symbol: string
  uri: string
  meta: UriMetadata | null
}

/** A pump.fun coin, read from its mint, its bonding curve and its fills. */
export function TokenView() {
  const address = useSearchParams().get('address')?.trim() ?? ''
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notCoin, setNotCoin] = useState(false)
  const [history, setHistory] = useState<TradeEvent[] | null>(null)
  const [holders, setHolders] = useState<{ owner: string; amount: bigint }[] | null>(null)
  const solPrice = useSolUsd()
  const feed = useFeed()

  const load = useCallback(async () => {
    if (!isSolanaAddress(address)) {
      setError('Enter a coin address, for example /token?address=<mint>.')
      return
    }
    const mint = new PublicKey(address)
    try {
      const coin = await fetchCoinState(mint)
      const onchain = await fetchOnchainMetadata(mint, coin.tokenProgram)
      const meta = onchain?.uri ? await fetchUriMetadata(onchain.uri) : null
      setData({
        coin,
        name: onchain?.name || meta?.name || '',
        symbol: onchain?.symbol || meta?.symbol || '',
        uri: onchain?.uri ?? '',
        meta,
      })
      setError(null)
    } catch (e) {
      const text = (e as Error).message
      if (/not launched on pump\.fun|No token exists/.test(text)) setNotCoin(true)
      setError(/not launched|No token/.test(text) ? text : describeRpcError(e))
    }
  }, [address])

  useEffect(() => {
    setData(null)
    setError(null)
    setNotCoin(false)
    setHistory(null)
    setHolders(null)
    void load()
  }, [load])

  // Fills and holders load after the header, so the page paints first.
  useEffect(() => {
    if (!data) return
    let alive = true
    void coinTrades(data.coin.mint, 150).then(
      (t) => alive && setHistory(t),
      () => alive && setHistory([]),
    )
    void topHolders(data.coin.mint).then(
      (h) => alive && setHolders(h),
      () => alive && setHolders([]),
    )
    return () => {
      alive = false
    }
  }, [data])

  // Fills that arrive on the live feed while this page is open.
  const live = useMemo(() => feed.trades.filter((t) => t.mint === address), [feed, address])
  const trades = useMemo(() => {
    const seen = new Set<string>()
    return [...live, ...(history ?? [])]
      .filter((t) => {
        const k = `${t.sig}:${t.index}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .sort((a, b) => b.timestamp - a.timestamp)
  }, [live, history])

  // The latest fill's reserves are newer than the curve as first read.
  const latest = trades[0]
  const curve = data?.coin.curve
  // Reserves are in the coin's quote: lamports for SOL, base units of the token otherwise.
  const vSol = latest ? latest.virtualSol : curve ? BigInt(curve.virtualQuoteReserves.toString()) : 0n
  const vTok = latest ? latest.virtualToken : curve ? BigInt(curve.virtualTokenReserves.toString()) : 0n
  const realTok = latest ? latest.realToken : curve ? BigInt(curve.realTokenReserves.toString()) : 0n
  const realSol = latest ? latest.realSol : curve ? BigInt(curve.realQuoteReserves.toString()) : 0n

  // Dollars per unit of the quote: SOL from Pyth, a token from Jupiter.
  const [tokenPrice, setTokenPrice] = useState<number | null>(null)
  const quoteMintId = data && !data.coin.isSol ? data.coin.quote.mint.toBase58() : null
  useEffect(() => {
    setTokenPrice(null)
    if (!quoteMintId) return
    void tokenUsd(quoteMintId).then(setTokenPrice)
  }, [quoteMintId])

  const [protocolProgress, setProtocolProgress] = useState<number | null>(null)
  useEffect(() => {
    void loadProtocol().then((p) => setProtocolProgress(curveProgress(realTok, p.global)), () => null)
  }, [realTok])


  if (error && !data) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold">{notCoin ? 'Not a pump.fun coin' : 'Could not load this coin'}</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{error}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {notCoin && isSolanaAddress(address) ? (
              <a
                href={explorerAccount(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary h-10 px-4 text-sm"
              >
                View as a wallet ↗
              </a>
            ) : (
              <button onClick={() => void load()} className="btn-primary h-10 px-4 text-sm">
                Try again
              </button>
            )}
            <Link href="/" className="btn-ghost h-10 px-4 text-sm">Back to Pulse</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return <Skeleton />

  const { coin, name, symbol, meta } = data
  const mintId = coin.mint.toBase58()
  const q = coin.quote
  const quoteUsd = coin.isSol ? solPrice : tokenPrice
  const mcSol = marketCapSol(vSol, vTok, undefined, q.decimals)
  const progress = coin.curve.complete ? 100 : (protocolProgress ?? curveProgress(realTok))
  const priceSol = priceInSol(vSol, vTok, q.decimals)
  const recentVolume = trades.reduce((s, t) => s + t.sol, 0n)
  const buys = trades.filter((t) => t.isBuy).length
  const creator = coin.curve.creator.toBase58()

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        {/* Header */}
        <section className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-4">
            <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[var(--surface-3)] ring-1 ring-[var(--line-strong)]">
              <TokenLogo logo={meta?.image} symbol={symbol || mintId} fill />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="display text-2xl sm:text-3xl">{name || shortAddress(mintId)}</h1>
                <span className="text-lg font-medium text-[var(--muted)]">${symbol}</span>
                {coin.curve.complete ? <span className="chip tag-up">Graduated</span> : <span className="chip tag-accent">Bonding curve</span>}
                {coin.curve.isHolderReward ? <span className="chip tag-gold">Holder rewards</span> : null}
                {coin.creatorFeeBps > 0 ? <span className="chip tag-gold">{coin.creatorFeeBps / 100}% tax</span> : null}
                {!coin.isSol ? <span className="chip">Priced in {q.symbol}</span> : null}
                {coin.curve.isMayhemMode ? <span className="chip tag-down">Mayhem</span> : null}
              </div>
              {meta?.description ? (
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">{meta.description}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <CopyChip value={mintId} />
                {meta?.twitter ? <Social href={meta.twitter} label="X" /> : null}
                {meta?.telegram ? <Social href={meta.telegram} label="Telegram" /> : null}
                {meta?.instagram ? <Social href={meta.instagram} label="Instagram" /> : null}
                {meta?.website ? <Social href={meta.website} label="Website" /> : null}
                <Social href={pumpFunCoin(mintId)} label="pump.fun" />
                <Social href={explorerToken(mintId)} label="Solscan" />
              </div>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Market cap"
              value={quoteUsd ? usd(mcSol * quoteUsd) : `${compact(mcSol, 2)} ${q.symbol}`}
              sub={quoteUsd ? `${compact(mcSol, 2)} ${q.symbol}` : undefined}
            />
            <Stat
              label="Price"
              value={quoteUsd ? `$${(priceSol * quoteUsd).toPrecision(3)}` : `${priceSol.toPrecision(3)} ${q.symbol}`}
              sub={`${priceSol.toPrecision(3)} ${q.symbol}`}
            />
            <Stat label="Recent volume" value={`${formatAmount(recentVolume, q.decimals, 2)} ${q.symbol}`} sub={`last ${trades.length} fills`} />
            <Stat label="Buys / sells" value={`${buys} / ${trades.length - buys}`} sub="recent fills" />
          </dl>
        </section>

        <PriceChart trades={trades} usdPerQuote={quoteUsd} quoteDecimals={q.decimals} quoteSymbol={q.symbol} />

        {/* Trades + holders */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className="card p-4 sm:p-5">
            <header className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold">Trades</h2>
              <span className="dot-live" />
              <span className="ml-auto text-xs text-[var(--muted)]">newest {trades.length}</span>
            </header>
            {history === null && trades.length === 0 ? (
              <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer h-8 rounded-lg" />)}</div>
            ) : trades.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--muted)]">No fills yet.</p>
            ) : (
              <div className="scroller max-h-[440px] pr-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="label text-left">
                      <th className="pb-2 font-normal">Account</th>
                      <th className="pb-2 font-normal">Type</th>
                      <th className="pb-2 text-right font-normal">{q.symbol}</th>
                      <th className="hidden pb-2 text-right font-normal sm:table-cell">{symbol || 'Tokens'}</th>
                      <th className="pb-2 text-right font-normal">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.slice(0, 150).map((t) => {
                      return (
                        <tr key={`${t.sig}-${t.index}`} className="border-t border-[var(--line)]">
                          <td className="py-2 pr-2">
                            <a
                              href={explorerAccount(t.user)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 hover:text-[var(--accent-hi)]"
                            >
                              <Identicon address={t.user} size={22} />
                              <span className="num truncate">{shortAddress(t.user)}</span>
                              {t.user === creator ? <span className="chip tag-gold !py-0 text-[10px]">dev</span> : null}
                            </a>
                          </td>
                          <td className={`py-2 text-xs font-semibold ${t.isBuy ? 'text-[var(--up)]' : 'text-[var(--down)]'}`}>
                            {t.isBuy ? 'Buy' : 'Sell'}
                          </td>
                          <td className="num py-2 text-right">{formatAmount(t.sol, q.decimals, 3)}</td>
                          <td className="num hidden py-2 text-right text-[var(--muted)] sm:table-cell">
                            {formatAmount(t.tokens, TOKEN_DECIMALS, 0)}
                          </td>
                          <td className="num py-2 text-right text-[var(--muted)]">
                            <a href={explorerTx(t.sig)} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent-hi)]">
                              {timeAgo(t.timestamp)} ↗
                            </a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <header className="mb-3 flex items-center">
              <h2 className="text-sm font-semibold">Top holders</h2>
              <span className="ml-auto text-xs text-[var(--muted)]">of 1B supply</span>
            </header>
            {holders === null ? (
              <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer h-7 rounded-lg" />)}</div>
            ) : holders.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--muted)]">Holder list unavailable on this RPC.</p>
            ) : (
              <ol className="space-y-1.5">
                {holders.map((h, i) => {
                  const isCurve = h.owner === bondingCurvePda(coin.mint).toBase58()
                  const pct = Number((h.amount * 10_000n) / 1_000_000_000_000_000n) / 100
                  return (
                    <li key={h.owner} className="flex items-center gap-2 text-sm">
                      <span className="num w-5 text-xs text-[var(--faint)]">{i + 1}</span>
                      <a href={explorerAccount(h.owner)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:text-[var(--accent-hi)]">
                        {isCurve ? 'Bonding curve' : h.owner === creator ? `${shortAddress(h.owner)} (dev)` : shortAddress(h.owner)}
                      </a>
                      <span className="num text-[var(--muted)]">{pct.toFixed(2)}%</span>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </div>
      </div>

      {/* Side */}
      <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
        <TradePanel coin={coin} symbol={symbol} onTraded={() => void load()} />

        <section className="card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Bonding curve</h2>
            <span className="num text-sm font-semibold">{progress.toFixed(1)}%</span>
          </div>
          <div className="meter mt-3">
            <span style={{ width: `${Math.max(progress, 1.5)}%` }} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
            {coin.curve.complete
              ? 'The curve sold out and liquidity moved to PumpSwap.'
              : `${formatAmount(realTok, TOKEN_DECIMALS, 0)} tokens still for sale. ${formatAmount(realSol, q.decimals, 2)} ${q.symbol} in the curve. When every token is bought, the coin graduates to PumpSwap.`}
          </p>
          <dl className="mt-4 space-y-2 text-xs">
            <Row k="Creator">
              {coin.curve.isHolderReward ? (
                <span className="text-[var(--gold)]">Holders (rewards PDA)</span>
              ) : (
                <a
                  href={explorerAccount(creator)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="num hover:text-[var(--accent-hi)]"
                >
                  {shortAddress(creator)}
                </a>
              )}
            </Row>
            <Row k="Priced in">{q.symbol}</Row>
            <Row k="Creator tax">
              {coin.creatorFeeBps > 0 ? (
                <span className="text-[var(--gold)]">{coin.creatorFeeBps / 100}% custom</span>
              ) : (
                'pump.fun standard'
              )}
            </Row>
            <Row k="Creator fees">{coin.curve.isHolderReward ? 'paid to holders' : 'paid to creator'}</Row>
            <Row k="Token program">{coin.tokenProgram.toBase58().startsWith('TokenzQd') ? 'Token-2022' : 'SPL Token'}</Row>
            <Row k="Bonding curve">
              <a href={explorerAccount(bondingCurvePda(coin.mint).toBase58())} target="_blank" rel="noopener noreferrer" className="num hover:text-[var(--accent-hi)]">
                {shortAddress(bondingCurvePda(coin.mint).toBase58())} ↗
              </a>
            </Row>
          </dl>
        </section>
      </aside>
    </div>
  )
}

/** The largest token accounts, resolved to their owners. */
async function topHolders(mint: PublicKey): Promise<{ owner: string; amount: bigint }[]> {
  const connection = getConnection()
  const largest = await connection.getTokenLargestAccounts(mint)
  const accounts = largest.value.slice(0, 12)
  const infos = await connection.getMultipleParsedAccounts(accounts.map((a) => a.address))
  return accounts.map((a, i) => {
    const parsed = infos.value[i]?.data as { parsed?: { info?: { owner?: string } } } | undefined
    return { owner: parsed?.parsed?.info?.owner ?? a.address.toBase58(), amount: BigInt(a.amount) }
  })
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="inset px-4 py-3">
      <dt className="label">{label}</dt>
      <dd className="num mt-1 text-lg font-semibold">{value}</dd>
      {sub ? <dd className="num text-[11px] text-[var(--faint)]">{sub}</dd> : null}
    </div>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--muted)]">{k}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function Social({ href, label }: { href: string; label: string }) {
  const safe = /^https?:\/\//i.test(href) ? href : `https://${href}`
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="chip hover:text-[var(--text)]">
      {label} ↗
    </a>
  )
}

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } catch {
          /* selectable on Solscan */
        }
      }}
      className="chip num hover:text-[var(--text)]"
      title={value}
    >
      {copied ? 'Copied' : `CA ${shortAddress(value, 5, 5)}`} ⧉
    </button>
  )
}

function Skeleton() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <div className="card p-6">
          <div className="flex gap-4">
            <div className="shimmer h-20 w-20 rounded-2xl" />
            <div className="flex-1 space-y-3 pt-2">
              <div className="shimmer h-6 w-1/3 rounded" />
              <div className="shimmer h-4 w-2/3 rounded" />
            </div>
          </div>
        </div>
        <div className="shimmer h-[400px] rounded-2xl" />
      </div>
      <div className="shimmer h-[420px] rounded-2xl" />
    </div>
  )
}

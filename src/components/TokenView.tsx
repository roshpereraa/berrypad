'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { Address } from 'viem'
import {
  LaunchpadV2Adapter,
  explorerAddress,
  formatAmount,
  formatBps,
  type CurveState,
  type LaunchedToken,
  type TokenMetadata,
} from '@/chain-adapter'
import { TokenLogo } from './TokenLogo'
import { TradePanel } from './TradePanel'
import { shortAddress } from '@/lib/display'
import { client, quoteAsset } from '@/lib/chain'

/** Token detail read entirely from chain — no index, no database. */
export function TokenView() {
  const address = (useSearchParams().get('address') ?? '') as Address
  const [data, setData] = useState<{
    record: LaunchedToken
    meta: TokenMetadata
    curve: CurveState | null
    quote: { symbol: string; decimals: number }
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      setError('Provide a token address, for example /token?address=0x…')
      return
    }
    let alive = true
    ;(async () => {
      try {
        const adapter = new LaunchpadV2Adapter(client)
        const record = await adapter.getLaunchedToken(address)
        if (!record) throw new Error('That address was not launched by the launchpad factory.')
        const [meta, curve] = await Promise.all([
          adapter.getTokenMetadata(address),
          adapter.getCurveState(address).catch(() => null),
        ])
        const quote = await quoteAsset(record.pairToken)
        if (alive) setData({ record, meta, curve, quote })
      } catch (e) {
        if (alive) {
          // viem errors carry the full request body; the short message is the useful part.
          const err = e as { shortMessage?: string; message?: string }
          setError(String(err.shortMessage || err.message || e).split('\n')[0]!.slice(0, 240))
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [address])

  if (error) {
    return (
      <div className="card p-8">
        <h1 className="text-lg font-semibold">Cannot show this token</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{error}</p>
        <Link href="/" className="btn-soft mt-4 inline-block px-4 py-2 text-sm">Back to the launchpad</Link>
      </div>
    )
  }
  if (!data) return <div className="card p-8 text-sm text-[var(--color-muted)]">Reading the chain…</div>

  const { record, meta, curve, quote } = data
  const pct =
    curve && curve.graduationThreshold > 0n
      ? Math.min(Number((curve.realQuoteReserve * 10_000n) / curve.graduationThreshold) / 100, 100)
      : 0

  return (
    <>
      <div className="flex flex-wrap items-start gap-4">
        <TokenLogo logo={meta.logo} symbol={meta.symbol} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">${meta.symbol}</h1>
            <span className="text-[var(--color-muted)]">{meta.name}</span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
            {meta.description || 'No description.'}
          </p>
          <a
            href={explorerAddress(record.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block font-mono text-xs text-[var(--color-muted)] underline"
          >
            {shortAddress(record.address)} ↗
          </a>
        </div>
      </div>

      {curve && !curve.graduated ? (
        <div className="card mt-5 p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Graduation progress</h2>
            <span className="text-xs text-[var(--color-muted)]">live from the bonding curve</span>
          </div>
          <div className="meter"><span style={{ width: `${Math.max(pct, 1)}%` }} /></div>
          <div className="mt-1.5 flex justify-between text-xs text-[var(--color-muted)]">
            <span>{pct.toFixed(2)}%</span>
            <span>
              {formatAmount(curve.realQuoteReserve, quote.decimals)} of{' '}
              {formatAmount(curve.graduationThreshold, quote.decimals)} {quote.symbol} · fee{' '}
              {formatBps(curve.feeBps)}
            </span>
          </div>
        </div>
      ) : null}

      <div className="mt-5 max-w-md">
        <TradePanel
          token={record.address}
          curve={record.curve}
          tokenSymbol={meta.symbol}
          tokenDecimals={meta.decimals}
          quoteSymbol={quote.symbol}
          quoteDecimals={quote.decimals}
          pairToken={record.pairToken}
          phase={curve?.graduated ? 'pool_created' : 'not_graduated'}
        />
      </div>
    </>
  )
}

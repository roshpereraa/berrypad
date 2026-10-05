'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { TradeEvent } from '@/lib/sol/events'
import { marketCapSol } from '@/lib/sol/pump'
import { compact } from '@/lib/sol/format'

const INTERVALS = [
  ['1m', 60],
  ['5m', 300],
  ['15m', 900],
  ['1h', 3600],
] as const

/**
 * Market cap candles built from the coin's own fills.
 *
 * Each fill carries the curve's reserves after it, so every candle is exact
 * for the fills it contains. Gaps between fills are flat: a bonding curve's
 * price only moves when someone trades.
 */
export function PriceChart({
  trades,
  usdPerQuote,
  quoteDecimals = 9,
  quoteSymbol = 'SOL',
}: {
  trades: TradeEvent[]
  usdPerQuote: number | null
  quoteDecimals?: number
  quoteSymbol?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const [interval, setInterval] = useState<number>(60)
  const usd = usdPerQuote !== null

  const candles = useMemo(() => {
    const fills = trades
      .filter((t) => t.virtualToken > 0n)
      .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index)
    const byBucket = new Map<number, { open: number; high: number; low: number; close: number }>()
    let previous: number | null = null
    for (const t of fills) {
      const mc = marketCapSol(t.virtualSol, t.virtualToken, undefined, quoteDecimals) * (usdPerQuote ?? 1)
      const bucket = Math.floor(t.timestamp / interval) * interval
      const candle = byBucket.get(bucket)
      if (!candle) {
        const open = previous ?? mc
        byBucket.set(bucket, { open, high: Math.max(open, mc), low: Math.min(open, mc), close: mc })
      } else {
        candle.high = Math.max(candle.high, mc)
        candle.low = Math.min(candle.low, mc)
        candle.close = mc
      }
      previous = mc
    }
    return [...byBucket.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([time, c]) => ({ time: time as UTCTimestamp, ...c }))
  }, [trades, interval, usdPerQuote, quoteDecimals])

  useEffect(() => {
    if (!box.current) return
    const c = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8a91a6',
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false },
      crosshair: { horzLine: { color: 'rgba(91,140,255,0.5)' }, vertLine: { color: 'rgba(91,140,255,0.5)' } },
    })
    const s = c.addSeries(CandlestickSeries, {
      upColor: '#3fe0a5',
      downColor: '#ff5f73',
      borderVisible: false,
      wickUpColor: '#3fe0a5',
      wickDownColor: '#ff5f73',
    })
    chart.current = c
    series.current = s
    return () => {
      c.remove()
      chart.current = null
      series.current = null
    }
  }, [])

  useEffect(() => {
    series.current?.applyOptions({
      priceFormat: {
        type: 'custom',
        formatter: (v: number) => (usd ? `$${compact(v, 2)}` : `${compact(v, 2)} ${quoteSymbol}`),
        minMove: 0.01,
      },
    })
    series.current?.setData(candles)
    chart.current?.timeScale().fitContent()
  }, [candles, usd, quoteSymbol])

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">Market cap {usd ? '(USD)' : `(${quoteSymbol})`}</h2>
        <div className="seg ml-auto">
          {INTERVALS.map(([label, seconds]) => (
            <button key={label} aria-pressed={interval === seconds} onClick={() => setInterval(seconds)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative h-[340px]">
        <div ref={box} className="absolute inset-0" />
        {candles.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-[var(--muted)]">
            No fills to chart yet.
          </div>
        ) : null}
      </div>
    </div>
  )
}

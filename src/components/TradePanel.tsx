'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import {
  buyInstructions,
  loadProtocol,
  quoteBuy,
  quoteSell,
  readableError,
  sellInstructions,
  simulateAndSend,
  type CoinState,
  type Priority,
  type Protocol,
} from '@/lib/sol/pump'
import { TOKEN_DECIMALS, pumpFunCoin } from '@/lib/sol/config'
import { NATIVE_MINT } from '@solana/spl-token'
import { swapQuote, swapSolFor, swapToSol, tokenBalance as readTokenBalance } from '@/lib/sol/swap'
import { formatAmount, parseUnits } from '@/lib/sol/format'
import { TxStatus, type TxPhase } from './TxStatus'

const BUY_PRESETS = ['0.1', '0.5', '1', '5']
const SELL_PRESETS = [25, 50, 75, 100]
const SLIPPAGES = [1, 5, 10, 20]

/**
 * Buy and sell on a pump.fun bonding curve.
 *
 * The quote comes from pump.fun's own curve maths against the curve as last
 * read; the same instructions are then simulated on chain before the wallet
 * is asked for anything, and the slippage bound is enforced by the program.
 */
export function TradePanel({
  coin,
  symbol,
  onTraded,
}: {
  coin: CoinState
  symbol: string
  onTraded?: () => void
}) {
  const { connection } = useConnection()
  const wallet = useWallet()
  const { setVisible } = useWalletModal()
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(5)
  const [priority, setPriority] = useState<Priority>('fast')
  const [showSettings, setShowSettings] = useState(false)
  const [protocol, setProtocol] = useState<Protocol | null>(null)
  const [solBalance, setSolBalance] = useState<bigint | null>(null)
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null)
  const [phase, setPhase] = useState<TxPhase>('idle')
  const [message, setMessage] = useState<string | undefined>()
  const [signature, setSignature] = useState<string | undefined>()
  /*
   * A coin priced in a token (WBTC for custom-tax coins) is still bought and
   * sold in SOL here: SOL is swapped into the token before a buy, and a
   * sale's proceeds are swapped back into SOL. Off means trading the token
   * directly from the wallet's own balance of it.
   */
  const [viaSol, setViaSol] = useState(true)
  const routed = !coin.isSol && viaSol
  const [step, setStep] = useState<string | undefined>()
  const [routeEst, setRouteEst] = useState<bigint | null>(null)

  useEffect(() => {
    void loadProtocol().then(setProtocol, () => setProtocol(null))
  }, [])

  const refreshBalances = useCallback(async () => {
    if (!wallet.publicKey) {
      setSolBalance(null)
      setTokenBalance(null)
      return
    }
    const owner = wallet.publicKey
    const ata = getAssociatedTokenAddressSync(coin.mint, owner, true, coin.tokenProgram)
    const quoteAta = coin.isSol || routed
      ? null
      : getAssociatedTokenAddressSync(coin.quote.mint, owner, true, coin.quote.tokenProgram)
    const [sol, tok] = await Promise.all([
      quoteAta
        ? connection.getTokenAccountBalance(quoteAta).then((b) => Number(b.value.amount), () => 0)
        : connection.getBalance(owner).catch(() => null),
      connection.getTokenAccountBalance(ata).catch(() => null),
    ])
    // For a token-priced coin "SOL balance" is the balance of that token.
    setSolBalance(sol === null ? null : BigInt(sol))
    setTokenBalance(tok ? BigInt(tok.value.amount) : 0n)
  }, [wallet.publicKey, connection, coin.mint, coin.tokenProgram, coin.isSol, coin.quote, routed])

  useEffect(() => {
    void refreshBalances()
  }, [refreshBalances])

  // What the wallet pays with and is paid in: SOL when routed.
  const payDecimals = routed ? 9 : coin.quote.decimals
  const raw = useMemo(
    () => (amount ? parseUnits(amount, side === 'buy' ? payDecimals : TOKEN_DECIMALS) : null),
    [amount, side, payDecimals],
  )

  const curveQuote = useMemo(() => {
    if (!protocol || !raw || raw <= 0n) return null
    try {
      if (side === 'buy') {
        if (!routed) return quoteBuy(protocol, coin.curve, raw)
        return routeEst === null ? null : quoteBuy(protocol, coin.curve, routeEst)
      }
      return quoteSell(protocol, coin.curve, raw)
    } catch {
      return null
    }
  }, [protocol, raw, side, coin.curve, routed, routeEst])

  // Routed: SOL in becomes token in (buy), or token out becomes SOL out (sell).
  const routeIn = side === 'buy' ? raw : curveQuote
  useEffect(() => {
    setRouteEst(null)
    if (!routed || !routeIn || routeIn <= 0n) return
    const amountIn = routeIn
    let alive = true
    const t = setTimeout(() => {
      const [from, to] = side === 'buy' ? [NATIVE_MINT, coin.quote.mint] : [coin.quote.mint, NATIVE_MINT]
      swapQuote(from, to, amountIn).then((q) => alive && setRouteEst(q.outAmount), () => undefined)
    }, 350)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [routed, routeIn, side, coin.quote.mint])

  // What the panel shows as received: tokens on a buy, SOL (routed) or the quote on a sell.
  const quote = side === 'sell' && routed ? routeEst : curveQuote

  const insufficient =
    raw !== null &&
    ((side === 'buy' && solBalance !== null && raw > solBalance) ||
      (side === 'sell' && tokenBalance !== null && raw > tokenBalance))

  const quoteSymbol = routed ? 'SOL' : coin.quote.symbol
  const outDecimals = routed ? 9 : coin.quote.decimals
  const busy = phase === 'preparing' || phase === 'simulating' || phase === 'signing' || phase === 'pending'

  async function submit() {
    if (!wallet.publicKey) {
      setVisible(true)
      return
    }
    if (!raw || raw <= 0n) return
    setSignature(undefined)
    setMessage(undefined)
    setPhase('preparing')
    const owner = wallet.publicKey
    const steps = {
      priority,
      onSigning: () => setPhase('signing'),
      onSent: (s: string) => {
        setSignature(s)
        setPhase('pending')
      },
    }
    let swappedIn = false
    try {
      let spend = raw
      const before = routed && side === 'sell' ? await readTokenBalance(owner, coin.quote) : 0n
      if (routed && side === 'buy') {
        setStep(`Step 1 of 2 · Swapping SOL to ${coin.quote.symbol}`)
        setPhase('simulating')
        spend = (await swapSolFor(wallet, coin.quote, raw, steps)).received
        swappedIn = true
        setSignature(undefined)
        setStep(`Step 2 of 2 · Buying with ${coin.quote.symbol}`)
        setPhase('preparing')
      } else if (routed) {
        setStep(`Step 1 of 2 · Selling for ${coin.quote.symbol}`)
      }
      const { instructions } =
        side === 'buy'
          ? await buyInstructions({ user: owner, mint: coin.mint, lamports: spend, slippagePct: slippage })
          : await sellInstructions({ user: owner, mint: coin.mint, tokens: raw, slippagePct: slippage })
      setPhase('simulating')
      const sig = await simulateAndSend(wallet, instructions, {
        ...steps,
        computeUnits: coin.isSol ? 250_000 : 320_000,
      })
      setSignature(sig)
      if (routed && side === 'sell') {
        let gained = 0n
        for (let i = 0; i < 5 && gained <= 0n; i++) {
          gained = (await readTokenBalance(owner, coin.quote)) - before
          if (gained <= 0n) await new Promise((r) => setTimeout(r, 1_200))
        }
        if (gained > 0n) {
          setStep(`Step 2 of 2 · Swapping ${coin.quote.symbol} to SOL`)
          setPhase('simulating')
          setSignature(await swapToSol(wallet, coin.quote, gained, steps))
        }
      }
      setStep(undefined)
      setPhase('success')
      setAmount('')
      void refreshBalances()
      onTraded?.()
    } catch (e) {
      const text = readableError(e)
      setMessage(
        text +
          (swappedIn
            ? ` Your ${coin.quote.symbol} from the swap is in your wallet. Switch off "Pay in SOL" to buy with it directly.`
            : ''),
      )
      void refreshBalances()
      setPhase((e as Error)?.name === 'SimulationError' ? 'blocked' : 'failed')
    }
  }

  if (coin.curve.complete) {
    return (
      <div className="card p-5">
        <h2 className="text-base font-semibold">Graduated</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          This coin finished its bonding curve and now trades in a PumpSwap pool. Trade it on
          pump.fun or through a Solana aggregator.
        </p>
        <div className="mt-4 grid gap-2">
          <a href={pumpFunCoin(coin.mint.toBase58())} target="_blank" rel="noopener noreferrer" className="btn-primary h-11 text-sm">
            Trade on pump.fun ↗
          </a>
          <a href={`https://jup.ag/swap/SOL-${coin.mint.toBase58()}`} target="_blank" rel="noopener noreferrer" className="btn-ghost h-11 text-sm">
            Swap on Jupiter ↗
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-2)] p-1">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setSide(s)
              setAmount('')
              setPhase('idle')
            }}
            className={`h-9 rounded-lg text-sm font-semibold transition-colors ${
              side === s
                ? s === 'buy'
                  ? 'bg-[var(--up)] text-[#04120c]'
                  : 'bg-[var(--down)] text-[#1a0508]'
                : 'text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {s === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{side === 'buy' ? `Amount (${quoteSymbol})` : `Amount (${symbol || 'tokens'})`}</span>
        <button onClick={() => setShowSettings((v) => !v)} className="hover:text-[var(--text)]">
          Slippage {slippage}% · {priority} ⚙
        </button>
      </div>

      {!coin.isSol ? (
        <label className="mt-2 flex items-center gap-2.5 text-xs text-[var(--muted)]">
          <button
            type="button"
            role="switch"
            aria-checked={viaSol}
            onClick={() => {
              setViaSol((v) => !v)
              setAmount('')
              if (!busy) setPhase('idle')
            }}
            className="switch"
            aria-label="Pay in SOL"
          />
          {viaSol
            ? `Pay in SOL. Swapped to ${coin.quote.symbol} for you (2 signatures).`
            : `Pay with your own ${coin.quote.symbol}.`}
        </label>
      ) : null}

      {showSettings ? (
        <div className="inset mt-2 space-y-3 p-3">
          <div>
            <div className="label mb-1.5">Max slippage</div>
            <div className="seg">
              {SLIPPAGES.map((s) => (
                <button key={s} aria-pressed={slippage === s} onClick={() => setSlippage(s)}>
                  {s}%
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-1.5">Priority fee</div>
            <div className="seg">
              {(['normal', 'fast', 'turbo'] as const).map((p) => (
                <button key={p} aria-pressed={priority === p} onClick={() => setPriority(p)}>
                  {p[0]!.toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative mt-2">
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value.replace(/[^0-9.]/g, ''))
            if (phase !== 'idle' && !busy) setPhase('idle')
          }}
          placeholder="0.00"
          className="num h-14 w-full pl-4 pr-20 text-xl font-semibold"
          aria-label={side === 'buy' ? `Amount in ${quoteSymbol}` : 'Amount in tokens'}
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-[var(--muted)]">
          {side === 'buy' ? quoteSymbol : `$${symbol}`}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {side === 'buy' && (coin.isSol || routed)
          ? BUY_PRESETS.map((p) => (
              <button key={p} onClick={() => setAmount(p)} className="btn-ghost h-8 text-xs">
                {p} SOL
              </button>
            ))
          : side === 'buy'
            ? SELL_PRESETS.map((p) => (
                <button
                  key={p}
                  disabled={!solBalance}
                  onClick={() => solBalance && setAmount(exact((solBalance * BigInt(p)) / 100n, payDecimals))}
                  className="btn-ghost h-8 text-xs disabled:opacity-40"
                >
                  {p}%
                </button>
              ))
          : SELL_PRESETS.map((p) => (
              <button
                key={p}
                disabled={!tokenBalance}
                onClick={() => tokenBalance && setAmount(exact((tokenBalance * BigInt(p)) / 100n, TOKEN_DECIMALS))}
                className="btn-ghost h-8 text-xs disabled:opacity-40"
              >
                {p}%
              </button>
            ))}
      </div>

      <dl className="mt-4 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <dt className="text-[var(--muted)]">You receive (est.)</dt>
          <dd className="num font-medium">
            {quote === null
              ? '—'
              : side === 'buy'
                ? `${formatAmount(quote, TOKEN_DECIMALS, 0)} ${symbol}`
                : `${formatAmount(quote, outDecimals, 4)} ${quoteSymbol}`}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--muted)]">{side === 'buy' ? 'Most you pay' : 'Least you get'}</dt>
          <dd className="num">
            {raw && quote !== null
              ? side === 'buy'
                ? `${formatAmount(raw + (raw * BigInt(slippage * 10)) / 1000n, payDecimals, 4)} ${quoteSymbol}`
                : `${formatAmount(quote - (quote * BigInt(slippage * 10)) / 1000n, outDecimals, 4)} ${quoteSymbol}`
              : '—'}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--muted)]">Balance</dt>
          <dd className="num">
            {!wallet.publicKey
              ? '—'
              : side === 'buy'
                ? solBalance === null
                  ? '…'
                  : `${formatAmount(solBalance, payDecimals, 4)} ${quoteSymbol}`
                : tokenBalance === null
                  ? '…'
                  : `${formatAmount(tokenBalance, TOKEN_DECIMALS, 2)} ${symbol}`}
          </dd>
        </div>
      </dl>

      <button
        onClick={() => void submit()}
        disabled={busy || (Boolean(wallet.publicKey) && (!raw || raw <= 0n || insufficient))}
        className={`${side === 'buy' ? 'btn-up' : 'btn-down'} mt-4 h-12 w-full text-sm`}
      >
        {!wallet.publicKey
          ? 'Connect wallet'
          : busy
            ? 'Working…'
            : insufficient
              ? 'Insufficient balance'
              : side === 'buy'
                ? `Buy ${symbol ? `$${symbol}` : ''}`
                : `Sell ${symbol ? `$${symbol}` : ''}`}
      </button>

      {step && phase !== 'idle' ? <p className="mt-3 text-xs font-medium text-[var(--accent-hi)]">{step}</p> : null}
      <TxStatus phase={phase} signature={signature} message={message} />

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--faint)]">
        Trades go straight to pump.fun&apos;s program from your wallet. pump.fun&apos;s trading fee
        and the creator fee{coin.creatorFeeBps > 0 ? ` (a custom ${coin.creatorFeeBps / 100}% on this coin)` : ''} are
        included in the estimate.
      </p>
    </div>
  )
}

/** Raw units as an exact decimal string for the input. */
function exact(raw: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals)
  const whole = raw / scale
  const fraction = (raw % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}


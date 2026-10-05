'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Keypair, PublicKey } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import {
  SOL_QUOTE,
  launchFeesFor,
  MAX_TX_BYTES,
  launchLookupTable,
  launchMarker,
  launchInstructions,
  loadProtocol,
  transactionSize,
  maxCustomCreatorFeeBps,
  quoteBuy,
  readableError,
  simulateAndSend,
  type Priority,
  type Protocol,
  type Quote,
} from '@/lib/sol/pump'
import { DEFAULT_PAIR, LAUNCH_PAIRS, type LaunchPair } from '@/lib/sol/pairs'
import { swapQuote, swapSolFor, swapToSol, tokenBalance } from '@/lib/sol/swap'
import { NATIVE_MINT } from '@solana/spl-token'
import { TOKEN_DECIMALS, pumpFunCoin } from '@/lib/sol/config'
import { getConnection } from '@/lib/sol/connection'
import { formatAmount, formatBps, formatSol, isSolanaAddress, parseUnits, shortAddress } from '@/lib/sol/format'
import { LogoUpload } from './LogoUpload'
import { TxStatus, type TxPhase } from './TxStatus'

/** Whether a mint exists on chain, asked a few times to ride out lagging RPC nodes. */
async function coinExists(mint: PublicKey): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    const info = await getConnection().getAccountInfo(mint, 'confirmed').catch(() => null)
    if (info) return true
    await new Promise((r) => setTimeout(r, 1_200))
  }
  return false
}

/** Rent and fees a create needs beyond the dev buy, with headroom. */
const CREATE_COST_LAMPORTS = 25_000_000n

function Field({ label, hint, children, error }: { label: string; hint?: string; children: React.ReactNode; error?: string | null }) {
  return (
    <label className="block">
      <span className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{label}</span>
        {hint ? <span className="text-xs text-[var(--faint)]">{hint}</span> : null}
      </span>
      <div className="mt-1.5">{children}</div>
      {error ? <p className="mt-1.5 text-xs text-[#ffb3bd]">{error}</p> : null}
    </label>
  )
}

/**
 * Create a coin on pump.fun.
 *
 * The image and metadata are pinned to IPFS through pump.fun, then a single
 * transaction runs pump.fun's `create_v2` (and the optional first buy) from
 * the creator's own wallet. It is simulated before the wallet is asked to
 * sign, exactly like every trade on the site.
 */
export function LaunchForm() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const { setVisible } = useWalletModal()

  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [twitter, setTwitter] = useState('')
  const [telegram, setTelegram] = useState('')
  const [website, setWebsite] = useState('')
  const [instagram, setInstagram] = useState('')
  const [showSocials, setShowSocials] = useState(false)
  const [devBuy, setDevBuy] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [holderReward, setHolderReward] = useState(false)
  const [creatorWallet, setCreatorWallet] = useState('')
  const [priority, setPriority] = useState<Priority>('fast')
  const [pair, setPair] = useState<LaunchPair>(DEFAULT_PAIR)
  const [feeBps, setFeeBps] = useState(300)
  /** The pair's token already in the wallet (e.g. WBTC from an earlier swap). */
  const [held, setHeld] = useState<bigint | null>(null)
  /** Spend what is already held on the first buy instead of swapping more SOL. */
  const [useHeld, setUseHeld] = useState(false)
  const running = useRef(false)
  const [estQuote, setEstQuote] = useState<bigint | null>(null)
  const [estError, setEstError] = useState<string | null>(null)
  const [step, setStep] = useState<string | undefined>()

  const [protocol, setProtocol] = useState<Protocol | null>(null)
  const [protocolError, setProtocolError] = useState<string | null>(null)
  const [balance, setBalance] = useState<bigint | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [mint, setMint] = useState<Keypair | null>(null)
  const [metadataUri, setMetadataUri] = useState<string | null>(null)
  const [phase, setPhase] = useState<TxPhase>('idle')
  const [message, setMessage] = useState<string | undefined>()
  const [signature, setSignature] = useState<string | undefined>()
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = () =>
      loadProtocol().then(
        (p) => {
          if (!alive) return
          setProtocol(p)
          setProtocolError(null)
        },
        (e) => {
          if (!alive) return
          setProtocolError(readableError(e))
          timer = setTimeout(attempt, 6_000)
        },
      )
    void attempt()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!wallet.publicKey) return setBalance(null)
    connection.getBalance(wallet.publicKey).then((b) => setBalance(BigInt(b)), () => setBalance(null))
  }, [wallet.publicKey, connection, done])

  /*
   * pump.fun ignores a custom creator fee on SOL-priced coins (confirmed by
   * simulating against the live program), so a custom tax means pricing the
   * coin in a token from pump.fun's approved list: WBTC by default. The
   * creator still pays in SOL: the first buy is swapped into WBTC first.
   */
  const tokenPair = pair.customFee
  const quote: Quote = useMemo(
    () =>
      tokenPair
        ? { mint: pair.mint, tokenProgram: pair.tokenProgram, decimals: pair.decimals, symbol: pair.symbol }
        : SOL_QUOTE,
    [pair, tokenPair],
  )
  const maxFee = protocol ? maxCustomCreatorFeeBps(protocol) : 300
  const customFeeAvailable = tokenPair && maxFee > 0
  const fee = customFeeAvailable ? Math.min(Math.max(feeBps, 1), maxFee) : 0

  const refreshHeld = useCallback(() => {
    if (!wallet.publicKey || !tokenPair) return setHeld(null)
    tokenBalance(wallet.publicKey, quote).then(setHeld, () => undefined)
  }, [wallet.publicKey, tokenPair, quote])
  useEffect(() => {
    refreshHeld()
  }, [refreshHeld, phase])
  const holding = tokenPair && held !== null && held > 0n
  const spendHeld = holding && useHeld

  // The first buy is always typed in SOL.
  const devLamports = useMemo(() => (devBuy ? (parseUnits(devBuy, 9) ?? 0n) : 0n), [devBuy])

  // For a token pair, what that SOL buys in the pair's token, from Jupiter.
  useEffect(() => {
    setEstQuote(null)
    setEstError(null)
    if (!tokenPair || devLamports <= 0n) return
    let alive = true
    const t = setTimeout(() => {
      swapQuote(NATIVE_MINT, quote.mint, devLamports).then(
        (q) => alive && setEstQuote(q.outAmount),
        (e) => alive && setEstError(readableError(e)),
      )
    }, 400)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [tokenPair, devLamports, quote.mint])

  const devQuoteIn = tokenPair ? (spendHeld ? held : estQuote) : devLamports
  const devTokens = useMemo(() => {
    if (!protocol || !devQuoteIn || devQuoteIn <= 0n) return null
    try {
      return quoteBuy(protocol, null, devQuoteIn, { quoteMint: quote.mint, creatorFeeBps: fee })
    } catch {
      return null
    }
  }, [protocol, devQuoteIn, quote.mint, fee])

  const fees = useMemo(() => (protocol ? launchFeesFor(protocol, quote, fee) : null), [protocol, quote, fee])
  const holderRewardsAvailable = protocol?.global.isHolderRewardEnabled ?? false

  const creatorTrim = creatorWallet.trim()
  const creatorInvalid = creatorTrim.length > 0 && !isSolanaAddress(creatorTrim)
  const creator = creatorTrim && !creatorInvalid ? creatorTrim : (wallet.publicKey?.toBase58() ?? '')
  const customCreator = Boolean(wallet.publicKey) && creator !== wallet.publicKey?.toBase58()

  const nameError = name.length > 32 ? 'At most 32 characters.' : null
  const symbolError = symbol.length > 10 ? 'At most 10 characters.' : null
  const valid =
    name.trim().length > 0 &&
    symbol.trim().length > 0 &&
    !nameError &&
    !symbolError &&
    image !== null &&
    !creatorInvalid &&
    (devBuy === '' || parseUnits(devBuy, quote.decimals) !== null)

  const totalCost =
    (spendHeld ? 0n : devLamports + (devLamports * 15n) / 1000n) + CREATE_COST_LAMPORTS
  const insufficient = balance !== null && balance < totalCost
  const busy = phase === 'preparing' || phase === 'simulating' || phase === 'signing' || phase === 'pending'

  async function launch() {
    if (!wallet.publicKey) return setVisible(true)
    // One launch at a time: a double tap must never start a second flow.
    if (running.current) return
    running.current = true
    try {
      await launchOnce()
    } finally {
      running.current = false
      refreshHeld()
    }
  }

  async function swapHeldBack() {
    if (!wallet.publicKey || !held || held <= 0n || running.current) return
    running.current = true
    setMessage(undefined)
    setSignature(undefined)
    setStep(`Swapping ${formatAmount(held, quote.decimals, 8)} ${quote.symbol} back to SOL`)
    try {
      setPhase('simulating')
      const sig = await swapToSol(wallet, quote, held, {
        priority,
        onSigning: () => setPhase('signing'),
        onSent: (s) => {
          setSignature(s)
          setPhase('pending')
        },
      })
      setSignature(sig)
      setStep(undefined)
      setPhase('success')
    } catch (e) {
      setMessage(readableError(e) + ' Check your wallet before trying again: if the balance changed, it went through.')
      setPhase((e as Error)?.name === 'SimulationError' ? 'blocked' : 'failed')
    } finally {
      running.current = false
      refreshHeld()
    }
  }

  async function launchOnce() {
    if (!wallet.publicKey) return
    setMessage(undefined)
    setSignature(undefined)
    // The same keypair across retries, so a retry can never mint a second coin.
    const mintKey = mint ?? Keypair.generate()
    setMint(mintKey)
    let holdsQuote = false
    try {

      // A retry after a reported failure: if this coin already exists on
      // chain, the earlier attempt landed. Never send it a second time.
      if (mint && (await coinExists(mint.publicKey))) {
        setPhase('success')
        setDone(true)
        return
      }

      let uri = metadataUri
      if (!uri) {
        setPhase('preparing')
        const form = new FormData()
        form.append('file', image!)
        form.append('name', name.trim())
        form.append('symbol', symbol.trim())
        form.append('description', description.trim())
        form.append('twitter', twitter.trim())
        form.append('telegram', telegram.trim())
        form.append('website', website.trim())
        form.append('instagram', instagram.trim())
        const res = await fetch('/api/ipfs', { method: 'POST', body: form })
        const body = (await res.json().catch(() => ({}))) as { metadataUri?: string; error?: string }
        if (!res.ok || !body.metadataUri) throw new Error(body.error ?? 'Could not store the metadata.')
        uri = body.metadataUri
        setMetadataUri(uri)
      }

      setPhase('simulating')
      const base = {
        quote,
        creatorFeeBps: fee,
        user: wallet.publicKey,
        mint: mintKey,
        name: name.trim(),
        symbol: symbol.trim(),
        uri,
        creator: new PublicKey(creator),
        holderReward: holderReward && holderRewardsAvailable,
      }
      const sendSteps = {
        priority,
        onSigning: () => setPhase('signing'),
        onSent: (s: string) => {
          setSignature(s)
          setPhase('pending')
        },
      }

      /*
       * Create and first buy always go in one transaction, so the coin can
       * never go live without the buy. A token pair needs the token for the first buy. Swap the SOL first
       * (step 1), then create and buy (step 2). The swapped amount is kept,
       * so if step 2 fails, trying again reuses it instead of swapping twice.
       */
      let devIn = devLamports
      if (tokenPair && (devLamports > 0n || spendHeld)) {
        /*
         * The wallet's own balance decides. WBTC already there (from this
         * launch's swap, an earlier attempt, or bought elsewhere) is used
         * first, and SOL is swapped only when there is not enough of it.
         */
        const have = await tokenBalance(wallet.publicKey, quote)
        if (spendHeld) {
          devIn = have
        } else {
          const route = await swapQuote(NATIVE_MINT, quote.mint, devLamports)
          if (have >= route.minOut) {
            devIn = have < route.outAmount ? have : route.outAmount
          } else {
            setStep(`Step 1 of 2 · Swapping ${devBuy} SOL to ${quote.symbol}`)
            setPhase('simulating')
            await swapSolFor(wallet, quote, devLamports, sendSteps)
            setSignature(undefined)
            const now = await tokenBalance(wallet.publicKey, quote)
            devIn = now < route.outAmount ? now : route.outAmount
          }
        }
        holdsQuote = devIn > 0n
        if (devIn <= 0n) {
          throw new Error(`No ${quote.symbol} is in your wallet yet, so the coin was not created. Try again in a moment.`)
        }
        setStep(`${spendHeld ? '' : 'Step 2 of 2 · '}Creating your coin and buying with ${formatAmount(devIn, quote.decimals, 8)} ${quote.symbol}`)
        setPhase('simulating')
      }

      const marker = launchMarker(wallet.publicKey)
      const table = await launchLookupTable()
      const tables = table ? [table] : []
      const units = tokenPair ? 500_000 : 450_000
      /*
       * The launch marker is a nice-to-have. A coin priced in a token has a
       * bigger first buy, and with the longest names the marker would push
       * it over Solana's size limit, so it is left off when it does not fit.
       */
      const buyIxs = devIn > 0n ? await launchInstructions({ ...base, devBuyLamports: devIn }) : null
      const withMarker = buyIxs ? [...buyIxs, marker] : null
      const combined =
        withMarker && transactionSize(wallet.publicKey, withMarker, units, tables) <= MAX_TX_BYTES ? withMarker : buyIxs
      const fits = combined !== null && transactionSize(wallet.publicKey, combined, units, tables) <= MAX_TX_BYTES

      if (combined && fits) {
        const sig = await simulateAndSend(wallet, combined, {
          ...sendSteps,
          signers: [mintKey],
          computeUnits: units,
          lookupTables: tables,
        })
        setSignature(sig)
      } else if (combined) {
        // Never split: a coin must not go live without the first buy its
        // creator asked for. If it cannot fit in one transaction, stop here.
        throw new Error(
          'Your coin and first buy do not fit in one Solana transaction right now, so the coin was not created. Shorten the name or ticker and try again.',
        )
      } else {
        const create = [...(await launchInstructions({ ...base, devBuyLamports: 0n })), marker]
        const sig = await simulateAndSend(wallet, create, {
          ...sendSteps,
          signers: [mintKey],
          computeUnits: tokenPair ? 500_000 : 300_000,
          lookupTables: tables,
        })
        setSignature(sig)
      }
      setMessage(undefined)
      setStep(undefined)
      setPhase('success')
      setDone(true)
    } catch (e) {
      // Whatever the error said, the chain is the authority: if the coin
      // exists, the launch transaction landed (create and first buy are one
      // transaction, so the buy landed with it).
      // A simulation failure means nothing was sent, so there is nothing to check.
      const sent = (e as Error)?.name !== 'SimulationError'
      const created = sent ? await coinExists(mintKey.publicKey) : false
      if (created) {
        setMessage(undefined)
        setStep(undefined)
        setPhase('success')
        setDone(true)
        return
      }
      const kept =
        tokenPair && holdsQuote
          ? ` Your ${quote.symbol} is safe in your wallet; Try again uses it without swapping again.`
          : ''
      setMessage(readableError(e) + kept)
      setPhase((e as Error)?.name === 'SimulationError' ? 'blocked' : 'failed')
    }
  }

  if (done && mint) {
    const id = mint.publicKey.toBase58()
    return (
      <div className="card relative overflow-hidden p-8 text-center">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-60 w-60 -translate-x-1/2 rounded-full bg-[var(--up)] opacity-20 blur-3xl" />
        <div className="relative">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--up-soft)] text-2xl text-[var(--up)]">✓</div>
          <h2 className="display mt-4 text-3xl">${symbol.trim()} is live</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
            {name.trim()} is trading on its pump.fun bonding curve. Share the address and watch the first fills come in.
          </p>
          <p className="num mt-4 break-all text-xs text-[var(--muted)]">{id}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href={`/token?address=${id}`} className="btn-primary h-11 px-5 text-sm">Open the coin</Link>
            <a href={pumpFunCoin(id)} target="_blank" rel="noopener noreferrer" className="btn-ghost h-11 px-5 text-sm">View on pump.fun ↗</a>
          </div>
          <TxStatus phase="success" signature={signature} />
        </div>
      </div>
    )
  }

  if (reviewing) {
    const rows: [string, React.ReactNode][] = [
      ['Name', name.trim()],
      ['Ticker', `$${symbol.trim()}`],
      ['Image', image?.name ?? '—'],
      ['Program', 'pump.fun create_v2 (Token-2022)'],
      ['Supply', '1,000,000,000 (6 decimals)'],
      ['Creator fees go to', holderReward && holderRewardsAvailable ? 'Holders, pro-rata' : customCreator ? creator : `${shortAddress(creator)} (you)`],
      ['Priced in', quote.symbol],
      ['Creator tax', fees ? `${formatBps(fees.creatorBps)} of every trade, paid in ${quote.symbol}` : `paid in ${quote.symbol}`],
      ['Trading fee at launch', fees ? `${formatBps(fees.protocolBps + fees.creatorBps)} total, ${formatBps(fees.creatorBps)} to creator` : '…'],
      [
        'Your first buy',
        devLamports <= 0n && !spendHeld
          ? 'none'
          : tokenPair
            ? spendHeld
              ? `${formatAmount(held!, quote.decimals, 8)} ${quote.symbol} you already hold`
              : `${devBuy} SOL → ≈ ${estQuote ? formatAmount(estQuote, quote.decimals, 8) : '…'} ${quote.symbol} (uses ${quote.symbol} you hold first)`
            : `${formatAmount(devLamports, 9, 6)} SOL`,
      ],
      ...(tokenPair && devLamports > 0n && !spendHeld
        ? ([['Signatures', `Up to 2: swap SOL to ${quote.symbol} (skipped if you already hold enough), then create and buy`]] as [string, string][])
        : []),
      ...(devTokens ? ([['You receive (est.)', `${formatAmount(devTokens, TOKEN_DECIMALS, 0)} ${symbol.trim()}`]] as [string, string][]) : []),
      ['Priority', priority],
      ['Estimated SOL cost', `~${formatSol(totalCost, 4)} SOL incl. rent and fees`],
    ]
    return (
      <div className="space-y-4">
        <div className="card p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Review your launch</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">This is what your wallet will be asked to sign.</p>
          <dl className="mt-5 divide-y divide-[var(--line)] text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6 py-2.5">
                <dt className="shrink-0 text-[var(--muted)]">{k}</dt>
                <dd className="break-all text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 rounded-xl bg-[var(--surface-2)] p-3 text-xs leading-relaxed text-[var(--muted)]">
            Name, ticker, image and socials are pinned to IPFS and written on chain. They cannot be changed after launch, and neither can where creator fees go.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setReviewing(false); setPhase('idle') }} disabled={busy} className="btn-ghost h-12 px-5 text-sm">
            Back
          </button>
          <button onClick={() => void launch()} disabled={busy} className="btn-primary h-12 flex-1 text-sm">
            {busy ? 'Launching…' : phase === 'failed' || phase === 'blocked' ? 'Try again' : 'Launch coin'}
          </button>
        </div>
        {step && phase !== 'idle' ? <p className="text-xs font-medium text-[var(--accent-hi)]">{step}</p> : null}
        <TxStatus phase={phase} signature={signature} message={message} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <Field label="Name" hint={`${name.length}/32`} error={nameError}>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Doge Classic" />
        </Field>
        <Field label="Ticker" hint={`${symbol.length}/10`} error={symbolError}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]">$</span>
            <input
              className="field pl-7 uppercase"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.replace(/\s/g, '').toUpperCase())}
              placeholder="DOGEC"
            />
          </div>
        </Field>
      </div>

      <Field label="Description" hint="optional">
        <textarea
          className="field min-h-24 resize-y"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          placeholder="What is this coin about?"
        />
      </Field>

      <Field label="Image" hint="required">
        <LogoUpload file={image} onChange={setImage} />
      </Field>

      <div>
        <button type="button" onClick={() => setShowSocials((v) => !v)} className="text-sm font-medium text-[var(--accent-hi)]">
          {showSocials ? '− Hide socials' : '+ Add socials'} <span className="text-[var(--faint)]">(optional)</span>
        </button>
        {showSocials ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input className="field" value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="X / Twitter link" aria-label="X link" />
            <input className="field" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="Telegram link" aria-label="Telegram link" />
            <input className="field" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="Instagram link" aria-label="Instagram link" />
            <input className="field" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" aria-label="Website" />
          </div>
        ) : null}
      </div>

      <div>
        <div className="text-sm font-medium">Pair</div>
        <div className="seg mt-2">
          {LAUNCH_PAIRS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={pair.id === p.id}
              disabled={busy}
              onClick={() => setPair(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          {tokenPair
            ? `Your coin is priced in ${quote.symbol}, which is what lets you set your own creator tax. You still pay in SOL: your first buy is swapped to ${quote.symbol} for you.`
            : 'Your coin is priced in SOL with pump.fun\'s standard creator fee, paid in SOL. pump.fun does not allow a custom tax on SOL coins.'}
        </p>
      </div>

      {holding ? (
        <div className="rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-2)] p-4">
          <div className="text-sm font-semibold">
            You hold {formatAmount(held!, quote.decimals, 8)} {quote.symbol}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            From earlier swaps. Your first buy uses it before swapping any more SOL, so nothing is swapped twice.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setUseHeld((v) => !v)}
              className={`btn-ghost h-8 px-3 text-xs ${useHeld ? 'text-[var(--text)] ring-1 ring-[var(--accent)]' : ''}`}
            >
              {useHeld ? '✓ ' : ''}Use all of it for my first buy
            </button>
            <button type="button" onClick={() => void swapHeldBack()} disabled={busy} className="btn-ghost h-8 px-3 text-xs">
              Swap it back to SOL
            </button>
          </div>
          {!reviewing && step && phase !== 'idle' ? <p className="mt-3 text-xs font-medium text-[var(--accent-hi)]">{step}</p> : null}
          {!reviewing ? <TxStatus phase={phase} signature={signature} message={message} /> : null}
        </div>
      ) : null}

      <div className={`inset p-4 ${spendHeld ? 'pointer-events-none opacity-40' : ''}`}>
        <Field label="Buy your own coin first" hint={tokenPair ? `optional, paid in SOL, swapped to ${quote.symbol}` : 'optional, same transaction'}>
          <div className="relative">
            <input
              className="field num pr-14"
              inputMode="decimal"
              value={devBuy}
              onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.0"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">SOL</span>
          </div>
        </Field>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['0.1', '0.5', '1', '2'].map((v) => (
            <button key={v} type="button" onClick={() => setDevBuy(v)} className="btn-ghost h-7 px-2.5 text-xs">
              {v} SOL
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {estError && tokenPair && devLamports > 0n
            ? estError
            : devTokens
              ? `${tokenPair && estQuote ? `≈ ${formatAmount(estQuote, quote.decimals, 8)} ${quote.symbol}, buying ` : ''}≈ ${formatAmount(devTokens, TOKEN_DECIMALS, 0)} ${symbol || 'tokens'} (${(Number(devTokens) / 1e13).toFixed(2)}% of supply). Buying in the create transaction means nobody can buy before you.`
              : 'Leave blank to launch without holding any of your own coin.'}
        </p>
      </div>

      {/* Creator rewards */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-sm font-semibold">{tokenPair ? 'Creator tax' : 'Creator rewards'}</div>
          <div className="num text-lg font-semibold text-[var(--up)]">{fees ? formatBps(fees.creatorBps) : customFeeAvailable ? formatBps(fee) : '…'}</div>
        </div>
        {customFeeAvailable ? (
          <div className="mt-3">
            <input
              type="range"
              min={10}
              max={maxFee}
              step={5}
              value={fee}
              onChange={(e) => setFeeBps(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
              aria-label="Creator tax"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[50, 100, 200, maxFee].filter((v, i, a) => v <= maxFee && a.indexOf(v) === i).map((v) => (
                <button key={v} type="button" aria-pressed={fee === v} onClick={() => setFeeBps(v)} className={`btn-ghost h-7 px-2.5 text-xs ${fee === v ? 'text-[var(--text)] ring-1 ring-[var(--accent)]' : ''}`}>
                  {formatBps(v)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          {tokenPair ? (
            <>
              Every buy and sell pays you {fees ? formatBps(fees.creatorBps) : 'your tax'} in {quote.symbol}, on the bonding
              curve and after graduation. It is held for you by pump.fun&apos;s program; claim it from{' '}
              <Link href="/fees" className="text-[var(--accent-hi)] underline">Creator fees</Link>, where one click claims it and
              swaps it to SOL.{fees ? ` Traders pay ${formatBps(fees.protocolBps + fees.creatorBps)} in total.` : ''} Fixed
              at launch, up to {formatBps(maxFee)}.
            </>
          ) : (
            <>
              Your coin is priced in SOL. Every buy and sell pays you {fees ? formatBps(fees.creatorBps) : 'a creator fee'} in SOL,
              on the bonding curve and after graduation. Claim it any time from{' '}
              <Link href="/fees" className="text-[var(--accent-hi)] underline">Creator fees</Link>.
              {fees ? ` Traders pay ${formatBps(fees.protocolBps + fees.creatorBps)} in total at launch.` : ''} pump.fun sets
              this rate; it does not accept a custom rate on SOL coins.
            </>
          )}
        </p>
      </div>

      {/* Advanced */}
      <div className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setAdvanced((o) => !o)}
          aria-expanded={advanced}
          className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-semibold"
        >
          Advanced
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={`text-[var(--muted)] transition-transform ${advanced ? 'rotate-180' : ''}`} aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {advanced || creatorInvalid ? (
          <div className="space-y-6 border-t border-[var(--line)] px-4 py-5">
            <div>
              <div className="text-sm font-medium">Holder fee sharing</div>
              <div className="mt-2.5 flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={holderReward && holderRewardsAvailable}
                  disabled={!holderRewardsAvailable}
                  onClick={() => setHolderReward((v) => !v)}
                  className="switch"
                  aria-label="Route creator fees to holders"
                />
                <span className="text-sm">
                  {holderReward && holderRewardsAvailable ? 'Creator fees go to holders' : 'Creator fees go to the creator wallet'}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                {protocol && !holderRewardsAvailable
                  ? 'pump.fun currently has holder rewards switched off, so this cannot be enabled right now.'
                  : "Make this a pump.fun holder-reward coin: the creator fee accrues to a vault owned by the coin and is paid out to holders pro-rata. Permanent."}
              </p>
            </div>

            <div className={holderReward && holderRewardsAvailable ? 'pointer-events-none opacity-40' : ''}>
              <Field label="Creator wallet" error={creatorInvalid ? 'Not a valid Solana address.' : null}>
                <input
                  className="field num"
                  value={creatorWallet}
                  onChange={(e) => setCreatorWallet(e.target.value.trim())}
                  placeholder={wallet.publicKey ? shortAddress(wallet.publicKey.toBase58(), 6, 6) : 'Solana address'}
                  spellCheck={false}
                  autoComplete="off"
                />
              </Field>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
                {customCreator && !creatorInvalid
                  ? `Creator fees go to ${shortAddress(creator)}, not your connected wallet. Only that wallet can claim them. Check it carefully.`
                  : 'Receives the creator fee on every trade. Leave blank to use your connected wallet.'}
              </p>
            </div>

            <div>
              <div className="text-sm font-medium">Priority fee</div>
              <div className="seg mt-2">
                {(['normal', 'fast', 'turbo'] as const).map((p) => (
                  <button key={p} type="button" aria-pressed={priority === p} onClick={() => setPriority(p)}>
                    {p[0]!.toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {protocolError && !protocol ? (
        <p className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--muted)] border-t-transparent" />
          Reading pump.fun&apos;s settings. Solana is busy, retrying automatically.
        </p>
      ) : null}

      <button
        onClick={() => (wallet.publicKey ? setReviewing(true) : setVisible(true))}
        disabled={Boolean(wallet.publicKey) && (!valid || insufficient || !protocol)}
        className="btn-primary h-12 w-full text-sm"
      >
        {!wallet.publicKey
          ? 'Connect wallet to launch'
          : !name.trim() || !symbol.trim()
            ? 'Name and ticker are required'
            : !image
              ? 'Add an image'
              : creatorInvalid
                ? 'Creator wallet is not a valid address'
                : insufficient
                  ? `Not enough SOL (need ~${formatSol(totalCost, 3)})`
                  : !protocol
                    ? 'Reading pump.fun…'
                    : 'Review launch'}
      </button>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import {
  collectCreatorFeeInstructions,
  collectTokenCreatorFeeInstructions,
  creatorFeeBalance,
  readableError,
  simulateAndSend,
  tokenCreatorFeeBalances,
  type TokenFeeBalance,
} from '@/lib/sol/pump'
import { describeRpcError } from '@/lib/sol/connection'
import { swapToSol, tokenBalance } from '@/lib/sol/swap'
import { formatAmount, formatSol } from '@/lib/sol/format'
import { useSolUsd } from '@/lib/sol/useSolUsd'
import { TxStatus, type TxPhase } from './TxStatus'

/**
 * Unclaimed creator fees for the connected wallet, and the claim.
 *
 * pump.fun pays only the wallet recorded as a coin's creator, so this reads
 * that wallet's vault and the claim is signed by that wallet. Nothing passes
 * through Agentmuse.
 */
export function CreatorFees() {
  const wallet = useWallet()
  const { setVisible } = useWalletModal()
  const solPrice = useSolUsd()
  const [balance, setBalance] = useState<bigint | null>(null)
  const [tokens, setTokens] = useState<TokenFeeBalance[]>([])
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<TxPhase>('idle')
  const [message, setMessage] = useState<string>()
  const [signature, setSignature] = useState<string>()
  const [step, setStep] = useState<string>()

  const refresh = useCallback(async () => {
    if (!wallet.publicKey) return setBalance(null)
    try {
      setBalance(await creatorFeeBalance(wallet.publicKey))
      setError(null)
      // Tax from coins priced in a token is paid in that token.
      tokenCreatorFeeBalances(wallet.publicKey).then(setTokens, () => setTokens([]))
    } catch (e) {
      setError(describeRpcError(e))
    }
  }, [wallet.publicKey])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(t)
  }, [refresh])

  async function claim(token?: TokenFeeBalance, asSol = false) {
    if (!wallet.publicKey) return
    const owner = wallet.publicKey
    setMessage(undefined)
    setSignature(undefined)
    setStep(token && asSol ? `Step 1 of 2 · Claiming ${token.quote.symbol}` : undefined)
    let claimed = false
    try {
      setPhase('preparing')
      const before = token && asSol ? await tokenBalance(owner, token.quote) : 0n
      const instructions = token
        ? await collectTokenCreatorFeeInstructions(wallet.publicKey, token.quote)
        : await collectCreatorFeeInstructions(wallet.publicKey)
      setPhase('simulating')
      const sig = await simulateAndSend(wallet, instructions, {
        computeUnits: 200_000,
        onSigning: () => setPhase('signing'),
        onSent: (s) => {
          setSignature(s)
          setPhase('pending')
        },
      })
      setSignature(sig)
      claimed = true
      if (token && asSol) {
        // Step 2: swap exactly what the claim paid out, nothing else held.
        let gained = 0n
        for (let i = 0; i < 5 && gained <= 0n; i++) {
          gained = (await tokenBalance(owner, token.quote)) - before
          if (gained <= 0n) await new Promise((r) => setTimeout(r, 1_200))
        }
        if (gained > 0n) {
          setStep(`Step 2 of 2 · Swapping ${token.quote.symbol} to SOL`)
          setPhase('simulating')
          const swapSig = await swapToSol(wallet, token.quote, gained, {
            onSigning: () => setPhase('signing'),
            onSent: (s) => {
              setSignature(s)
              setPhase('pending')
            },
          })
          setSignature(swapSig)
        }
      }
      setStep(undefined)
      setPhase('success')
      void refresh()
    } catch (e) {
      void refresh()
      setMessage(
        readableError(e) +
          (claimed && token ? ` Your claimed ${token.quote.symbol} is in your wallet; nothing was lost.` : ''),
      )
      setPhase((e as Error)?.name === 'SimulationError' ? 'blocked' : 'failed')
    }
  }

  if (!wallet.publicKey) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-[var(--muted)]">Connect the wallet you launched with to see what you have earned.</p>
        <button onClick={() => setVisible(true)} className="btn-primary mt-5 h-11 px-6 text-sm">
          Connect wallet
        </button>
      </div>
    )
  }

  const busy = phase === 'preparing' || phase === 'simulating' || phase === 'signing' || phase === 'pending'

  return (
    <div className="card relative overflow-hidden p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[var(--up)] opacity-10 blur-3xl" />
      <div className="relative">
        <div className="label">Unclaimed</div>
        <div className="num mt-2 text-5xl font-semibold tracking-tight">
          {balance === null ? <span className="shimmer inline-block h-12 w-48 rounded-lg" /> : `${formatSol(balance, 4)} SOL`}
        </div>
        {balance !== null && solPrice ? (
          <div className="num mt-1 text-sm text-[var(--muted)]">≈ ${((Number(balance) / 1e9) * solPrice).toFixed(2)}</div>
        ) : null}
        {error ? <p className="mt-3 text-xs text-[#ffb3bd]">{error}</p> : null}
        <button
          onClick={() => void claim()}
          disabled={busy || balance === null || balance === 0n}
          className="btn-up mt-6 h-12 w-full text-sm"
        >
          {busy ? 'Claiming…' : balance === 0n ? 'Nothing to claim in SOL yet' : 'Claim SOL to my wallet'}
        </button>
        {tokens.length > 0 ? (
          <div className="mt-6">
            <div className="label mb-2">Paid in tokens (custom-tax coins)</div>
            <ul className="space-y-2">
              {tokens.map((t) => (
                <li key={t.quote.mint.toBase58()} className="inset flex items-center gap-3 px-3.5 py-2.5">
                  <span className="num flex-1 text-sm font-semibold">
                    {formatAmount(t.amount, t.quote.decimals, 4)} {t.quote.symbol}
                  </span>
                  <button onClick={() => void claim(t, true)} disabled={busy} className="btn-up h-8 px-3 text-xs">
                    Claim as SOL
                  </button>
                  <button onClick={() => void claim(t)} disabled={busy} className="btn-ghost h-8 px-3 text-xs">
                    Claim {t.quote.symbol}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {step && phase !== 'idle' ? <p className="mt-3 text-xs font-medium text-[var(--accent-hi)]">{step}</p> : null}
        <TxStatus phase={phase} signature={signature} message={message} />
        <p className="mt-4 text-xs leading-relaxed text-[var(--faint)]">
          Covers pump.fun&apos;s bonding-curve vault and the PumpSwap vault for coins that graduated.
          Holder-reward coins pay their fees to holders instead, so they never show up here.
        </p>
      </div>
    </div>
  )
}

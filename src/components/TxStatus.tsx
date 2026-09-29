'use client'

import { explorerTx } from '@/chain-adapter'

export type TxPhase = 'idle' | 'simulating' | 'blocked' | 'signing' | 'pending' | 'success' | 'failed'

/**
 * Pending / success / failure states with an explorer link, shared by the
 * launch flow and the trade panel.
 */
export function TxStatus({
  phase,
  hash,
  message,
}: {
  phase: TxPhase
  hash?: `0x${string}`
  message?: string
}) {
  if (phase === 'idle') return null

  const tone =
    phase === 'success'
      ? 'border-[var(--accent)]/40 bg-[var(--color-blue-soft)] text-[var(--accent-hi)]'
      : phase === 'failed' || phase === 'blocked'
        ? 'border-red-900 bg-[rgba(239,68,68,0.08)] text-red-300'
        : 'border-white/10 bg-white/5 text-[var(--color-muted)]'

  const label: Record<Exclude<TxPhase, 'idle'>, string> = {
    simulating: 'Simulating…',
    blocked: 'Cannot proceed',
    signing: 'Confirm in your wallet…',
    pending: 'Transaction submitted, waiting for confirmation…',
    success: 'Confirmed',
    failed: 'Transaction failed',
  }

  return (
    <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${tone}`}>
      <div className="font-medium">{label[phase]}</div>
      {message ? <p className="mt-1 break-words opacity-90">{message}</p> : null}
      {hash ? (
        <a
          href={explorerTx(hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block underline"
        >
          View on explorer ↗
        </a>
      ) : null}
    </div>
  )
}

/**
 * Turns a viem/wagmi error into something a person can act on.
 *
 * Contract reverts arrive wrapped in several layers; the custom error name is
 * the useful part and is what the launchpad contracts actually communicate with.
 */
export function readableError(error: unknown): string {
  if (!error) return ''
  const err = error as { shortMessage?: string; message?: string; cause?: unknown }
  const raw = err.shortMessage || err.message || String(error)

  const known: Record<string, string> = {
    SlippageExceeded: 'Price moved past your slippage limit. Raise the tolerance or try a smaller size.',
    CurveGraduated: 'This launch has finished its bonding curve and now trades on Uniswap V4.',
    LaunchEconomicsMismatch:
      'The launch terms changed while you were filling the form. Reload and try again.',
    NotWhitelisted: 'Launching is currently restricted on this factory.',
    ZeroAmount: 'Enter an amount above zero.',
    InsufficientFunds: 'Not enough balance to cover the amount plus gas.',
    LaunchFeeNotPaid: 'The launch fee was not included.',
  }
  for (const [name, friendly] of Object.entries(known)) {
    if (raw.includes(name)) return friendly
  }
  if (/User rejected|User denied|rejected the request/i.test(raw)) {
    return 'You rejected the request in your wallet.'
  }
  if (/insufficient funds/i.test(raw)) {
    return 'Not enough ETH to cover the amount plus gas.'
  }
  return raw.split('\n')[0]!.slice(0, 240)
}

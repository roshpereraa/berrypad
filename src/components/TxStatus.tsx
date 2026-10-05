'use client'

import { explorerTx } from '@/lib/sol/config'

export type TxPhase = 'idle' | 'preparing' | 'simulating' | 'blocked' | 'signing' | 'pending' | 'success' | 'failed'

const LABEL: Record<Exclude<TxPhase, 'idle'>, string> = {
  preparing: 'Preparing…',
  simulating: 'Simulating on Solana…',
  blocked: 'Would fail, so nothing was sent',
  signing: 'Approve in your wallet…',
  pending: 'Sent. Waiting for confirmation…',
  success: 'Confirmed on Solana',
  failed: 'Transaction failed',
}

export function TxStatus({ phase, signature, message }: { phase: TxPhase; signature?: string; message?: string }) {
  if (phase === 'idle') return null
  const tone =
    phase === 'success'
      ? 'border-[rgba(63,224,165,0.3)] bg-[var(--up-soft)] text-[var(--up)]'
      : phase === 'failed' || phase === 'blocked'
        ? 'border-[rgba(255,95,115,0.3)] bg-[var(--down-soft)] text-[#ffb3bd]'
        : 'border-[var(--line-strong)] bg-white/[0.03] text-[var(--muted)]'
  const busy = phase === 'preparing' || phase === 'simulating' || phase === 'signing' || phase === 'pending'
  return (
    <div className={`mt-3 rounded-xl border px-3.5 py-2.5 text-xs ${tone}`} role="status">
      <div className="flex items-center gap-2 font-medium">
        {busy ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
        {LABEL[phase]}
      </div>
      {message ? <p className="mt-1 break-words leading-relaxed opacity-90">{message}</p> : null}
      {signature ? (
        <a href={explorerTx(signature)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block underline">
          View on Solscan ↗
        </a>
      ) : null}
    </div>
  )
}

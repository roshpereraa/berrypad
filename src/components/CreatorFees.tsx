'use client'

import { formatEther, type Address } from 'viem'
import {
  useAccount,
  useReadContract,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { CONTRACTS, ROBINHOOD_CHAIN_ID, v2FeeEscrowAbi } from '@/chain-adapter'
import { TxStatus, readableError, type TxPhase } from './TxStatus'
import { shortAddress } from '@/lib/display'

/**
 * Creator fee balance and claim.
 *
 * Fees never pass through this app. They sit in the fee escrow credited to
 * the address recorded at launch, and only that address can withdraw them —
 * so this button calls the escrow from the creator's own wallet and we never
 * hold or forward anything.
 *
 * The balance shown is the recipient's TOTAL across every launch they own,
 * because that is what the escrow tracks; it is not per-token.
 */
export function CreatorFees({ creatorFeeRecipient }: { creatorFeeRecipient: Address | null }) {
  const { address, chainId, isConnected } = useAccount()
  const isRecipient =
    Boolean(address) && creatorFeeRecipient?.toLowerCase() === address?.toLowerCase()
  const wrongNetwork = isConnected && chainId !== ROBINHOOD_CHAIN_ID

  const { data: claimable, refetch } = useReadContract({
    address: CONTRACTS.v2FeeEscrow,
    abi: v2FeeEscrowAbi,
    functionName: 'balanceOf',
    args: [(creatorFeeRecipient ?? address) as Address],
    query: { enabled: Boolean(creatorFeeRecipient ?? address), refetchInterval: 20_000 },
  })

  const sim = useSimulateContract({
    address: CONTRACTS.v2FeeEscrow,
    abi: v2FeeEscrowAbi,
    functionName: 'claim',
    account: address,
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled: isRecipient && !wrongNetwork && (claimable ?? 0n) > 0n, retry: false },
  })

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash })

  let phase: TxPhase = 'idle'
  let message: string | undefined
  if (confirmed) phase = 'success'
  else if (confirming) phase = 'pending'
  else if (isPending) phase = 'signing'
  else if (error) { phase = 'failed'; message = readableError(error) }

  if (!creatorFeeRecipient) return null

  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">Creator fees</h2>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <span className="text-xl font-semibold text-[var(--color-accent)]">
          {claimable !== undefined ? formatEther(claimable) : '…'} ETH
        </span>
        <span className="text-[11px] text-[var(--color-muted)]">
          claimable now, across every launch paid to {shortAddress(creatorFeeRecipient)}
        </span>
      </div>

      {isRecipient ? (
        <button
          onClick={() => { reset(); if (sim.data?.request) writeContract(sim.data.request) }}
          disabled={!sim.data || isPending || confirming}
          className="btn-accent mt-3 rounded-lg px-4 py-2 text-sm"
        >
          {(claimable ?? 0n) === 0n ? 'Nothing to claim' : isPending || confirming ? 'Claiming…' : 'Claim fees'}
        </button>
      ) : (
        <p className="mt-3 text-[11px] text-[var(--color-muted)]">
          Payable to {shortAddress(creatorFeeRecipient)}. Connect that wallet to claim.
        </p>
      )}

      <TxStatus phase={phase} hash={hash} message={message} />
      {confirmed ? (
        <button onClick={() => { reset(); void refetch() }} className="mt-2 text-xs underline">
          Refresh
        </button>
      ) : null}
    </section>
  )
}

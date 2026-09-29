'use client'

import { useMemo, useState } from 'react'
import { formatUnits, parseUnits, type Address } from 'viem'
import {
  useAccount,
  useBalance,
  useReadContracts,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import {
  NATIVE_QUOTE,
  ROBINHOOD_CHAIN_ID,
  curveMath,
  explorerAddress,
  formatBps,
  v2CurveAbi,
  v2TokenAbi,
} from '@/chain-adapter'
import { TxStatus, readableError, type TxPhase } from './TxStatus'

type Side = 'buy' | 'sell'

const SLIPPAGE_PRESETS = [50n, 100n, 300n, 1000n] as const

export function TradePanel({
  token,
  curve,
  tokenSymbol,
  tokenDecimals,
  quoteSymbol,
  quoteDecimals,
  pairToken,
  phase,
}: {
  token: Address
  curve: Address | null
  tokenSymbol: string
  tokenDecimals: number
  quoteSymbol: string
  quoteDecimals: number
  pairToken: Address
  phase: string
}) {
  const { address, chainId, isConnected } = useAccount()
  const [side, setSide] = useState<Side>('buy')
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState<bigint>(300n)

  const isNative = pairToken.toLowerCase() === NATIVE_QUOTE.toLowerCase()
  const wrongNetwork = isConnected && chainId !== ROBINHOOD_CHAIN_ID

  // Project rule 5: a graduated launch trades on a Uniswap V4 pool, not on the
  // curve. Rather than pretend one generic "buy" covers both, say so plainly.
  if (phase !== 'not_graduated' || !curve) {
    return (
      <section className="rounded-lg border border-white/10 p-4 ">
        <h2 className="text-sm font-semibold">Trade</h2>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          This launch has graduated. Its bonding curve is closed and it now trades in a locked
          Uniswap V4 pool.{' '}
          <a
            href={explorerAddress(token)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View the token on the explorer ↗
          </a>
        </p>
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          Routing through the V4 pool is not wired up in this interface yet.
        </p>
      </section>
    )
  }

  // --- live curve state -----------------------------------------------------
  const curveContract = { address: curve, abi: v2CurveAbi } as const
  const { data: curveData, refetch: refetchCurve } = useReadContracts({
    contracts: [
      { ...curveContract, functionName: 'getReserves' },
      { ...curveContract, functionName: 'sellableTokens' },
      { ...curveContract, functionName: 'feeBps' },
      { ...curveContract, functionName: 'creatorTaxBps' },
      {
        ...curveContract,
        functionName: 'currentSnipeTaxBps',
        args: [address ?? '0x0000000000000000000000000000000000000000'],
      },
      { ...curveContract, functionName: 'graduated' },
    ],
    query: { refetchInterval: 8_000 },
  })

  const reserves = curveData?.[0]?.result as readonly [bigint, bigint] | undefined
  const sellable = curveData?.[1]?.result as bigint | undefined
  const feeBps = curveData?.[2]?.result as bigint | undefined
  const creatorTaxBps = curveData?.[3]?.result as bigint | undefined
  const snipeTaxBps = (curveData?.[4]?.result as bigint | undefined) ?? 0n
  const graduated = curveData?.[5]?.result as boolean | undefined

  // --- balances -------------------------------------------------------------
  const { data: nativeBalance } = useBalance({
    address,
    query: { enabled: Boolean(address) && isNative },
  })
  const { data: holdings } = useReadContracts({
    contracts: [
      { address: token, abi: v2TokenAbi, functionName: 'balanceOf', args: [address as Address] },
      {
        address: token,
        abi: v2TokenAbi,
        functionName: 'allowance',
        args: [address as Address, curve],
      },
    ],
    query: { enabled: Boolean(address), refetchInterval: 12_000 },
  })

  // Kept as its own hook rather than a conditional entry in the array above:
  // wagmi types the contract list as a tuple, and a conditional spread collapses
  // the inference for every entry.
  const { data: quoteHoldings } = useReadContracts({
    contracts: [
      { address: pairToken, abi: v2TokenAbi, functionName: 'balanceOf', args: [address as Address] },
      {
        address: pairToken,
        abi: v2TokenAbi,
        functionName: 'allowance',
        args: [address as Address, curve],
      },
    ],
    query: { enabled: Boolean(address) && !isNative, refetchInterval: 12_000 },
  })

  const tokenBalance = (holdings?.[0]?.result as bigint | undefined) ?? 0n
  const tokenAllowance = (holdings?.[1]?.result as bigint | undefined) ?? 0n
  const quoteBalance = isNative
    ? (nativeBalance?.value ?? 0n)
    : ((quoteHoldings?.[0]?.result as bigint | undefined) ?? 0n)
  // Native ETH needs no allowance.
  const quoteAllowance = isNative
    ? 2n ** 255n
    : ((quoteHoldings?.[1]?.result as bigint | undefined) ?? 0n)

  // --- parse input ----------------------------------------------------------
  const decimalsIn = side === 'buy' ? quoteDecimals : tokenDecimals
  const parsed = useMemo(() => {
    if (!amount.trim()) return null
    try {
      const v = parseUnits(amount.trim(), decimalsIn)
      return v > 0n ? v : null
    } catch {
      return null
    }
  }, [amount, decimalsIn])

  // --- local quote ----------------------------------------------------------
  const quote = useMemo(() => {
    if (!parsed || !reserves || sellable === undefined || feeBps === undefined || creatorTaxBps === undefined) {
      return null
    }
    try {
      if (side === 'buy') {
        const r = curveMath.quoteBuy({
          quoteIn: parsed,
          quoteReserve: reserves[0],
          tokenReserve: reserves[1],
          sellableTokens: sellable,
          feeBps,
          creatorTaxBps,
        })
        return { out: r.tokensOut, partial: r.partialFill, spent: r.spent, refund: r.refund }
      }
      const r = curveMath.quoteSell({
        tokensIn: parsed,
        quoteReserve: reserves[0],
        tokenReserve: reserves[1],
        feeBps,
        creatorTaxBps,
      })
      return { out: r.quoteOut, partial: false, spent: parsed, refund: 0n }
    } catch {
      return null
    }
  }, [parsed, reserves, sellable, feeBps, creatorTaxBps, side])

  const minOut = quote ? curveMath.applySlippage(quote.out, slippageBps) : 0n
  const decimalsOut = side === 'buy' ? tokenDecimals : quoteDecimals
  const symbolIn = side === 'buy' ? quoteSymbol : tokenSymbol
  const symbolOut = side === 'buy' ? tokenSymbol : quoteSymbol

  // --- approvals ------------------------------------------------------------
  const needsApproval =
    parsed !== null &&
    (side === 'sell' ? tokenAllowance < parsed : !isNative && quoteAllowance < parsed)
  const approvalTarget = side === 'sell' ? token : pairToken

  const { writeContract, data: hash, isPending: signing, error: writeError, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess: confirmed, data: receipt } = useWaitForTransactionReceipt({ hash })

  // --- simulation (project rule 4: never sign an unsimulated transaction) ---
  const canSimulate =
    Boolean(address) &&
    !wrongNetwork &&
    parsed !== null &&
    quote !== null &&
    !needsApproval &&
    !graduated

  // buy() is payable and sell() is not, so they are simulated separately - a
  // single hook over a union of the two makes `value` untypeable.
  const buySim = useSimulateContract({
    address: curve,
    abi: v2CurveAbi,
    functionName: 'buy',
    args: parsed !== null && address ? [parsed, minOut, address] : undefined,
    value: isNative && parsed !== null ? parsed : 0n,
    account: address,
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled: canSimulate && side === 'buy', retry: false },
  })

  const sellSim = useSimulateContract({
    address: curve,
    abi: v2CurveAbi,
    functionName: 'sell',
    args: parsed !== null && address ? [parsed, minOut, address] : undefined,
    account: address,
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled: canSimulate && side === 'sell', retry: false },
  })

  const sim = side === 'buy' ? buySim : sellSim

  const approvalSim = useSimulateContract({
    address: approvalTarget,
    abi: v2TokenAbi,
    functionName: 'approve',
    args: parsed !== null ? [curve, parsed] : undefined,
    account: address,
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled: Boolean(address) && !wrongNetwork && needsApproval && parsed !== null, retry: false },
  })

  const insufficient =
    parsed !== null && (side === 'buy' ? parsed > quoteBalance : parsed > tokenBalance)

  let txPhase: TxPhase = 'idle'
  let txMessage: string | undefined
  if (confirmed) txPhase = 'success'
  else if (confirming) txPhase = 'pending'
  else if (signing) txPhase = 'signing'
  else if (writeError) {
    txPhase = 'failed'
    txMessage = readableError(writeError)
  } else if (canSimulate && sim.isFetching) txPhase = 'simulating'
  else if (canSimulate && sim.error) {
    txPhase = 'blocked'
    txMessage = readableError(sim.error)
  }
  if (receipt && receipt.status === 'reverted') {
    txPhase = 'failed'
    txMessage = 'The transaction reverted on chain.'
  }

  const submit = () => {
    reset()
    if (needsApproval) {
      if (approvalSim.data?.request) writeContract(approvalSim.data.request)
      return
    }
    // Branch on the concrete hook: the two request shapes differ (payable vs
    // not), so the union cannot be passed to writeContract directly.
    if (side === 'buy') {
      if (buySim.data?.request) writeContract(buySim.data.request)
    } else if (sellSim.data?.request) {
      writeContract(sellSim.data.request)
    }
  }

  const disabled =
    !isConnected ||
    wrongNetwork ||
    parsed === null ||
    insufficient ||
    signing ||
    confirming ||
    (needsApproval ? !approvalSim.data : !sim.data)

  const setMax = () => {
    const max = side === 'buy' ? quoteBalance : tokenBalance
    if (side === 'buy' && isNative) {
      // Leave a little native currency behind for gas.
      const reserve = 10n ** 15n
      setAmount(formatUnits(max > reserve ? max - reserve : 0n, decimalsIn))
    } else {
      setAmount(formatUnits(max, decimalsIn))
    }
  }

  return (
    <section className="rounded-lg border border-white/10 p-4 ">
      <div className="mb-3 flex gap-1 rounded-full border border-white/10 bg-white/5 p-1">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setSide(s)
              setAmount('')
              reset()
            }}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              side === s
                ? 'btn-primary'
                : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <label className="block text-xs text-[var(--color-muted)]">
        You pay ({symbolIn})
        <div className="mt-1 flex gap-2">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.0"
            className="w-full px-3 py-2 text-sm tabular-nums"
          />
          <button
            type="button"
            onClick={setMax}
            className="shrink-0 rounded-md border border-neutral-300 px-2 text-xs hover:border-neutral-500 dark:border-neutral-700"
          >
            Max
          </button>
        </div>
      </label>
      <p className="mt-1 text-[11px] text-[var(--color-muted)]">
        Balance:{' '}
        {side === 'buy'
          ? `${formatUnits(quoteBalance, quoteDecimals)} ${quoteSymbol}`
          : `${formatUnits(tokenBalance, tokenDecimals)} ${tokenSymbol}`}
      </p>

      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="text-[var(--color-muted)]">Slippage</span>
        {SLIPPAGE_PRESETS.map((bps) => (
          <button
            key={String(bps)}
            onClick={() => setSlippageBps(bps)}
            className={`rounded px-2 py-0.5 ${
              slippageBps === bps
                ? 'btn-primary'
                : 'border border-neutral-300 dark:border-neutral-700'
            }`}
          >
            {formatBps(bps)}
          </button>
        ))}
      </div>

      {quote ? (
        <dl className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs ">
          <div className="flex justify-between">
            <dt className="text-[var(--color-muted)]">You receive (estimated)</dt>
            <dd className="font-medium tabular-nums">
              {Number(formatUnits(quote.out, decimalsOut)).toLocaleString(undefined, {
                maximumFractionDigits: 6,
              })}{' '}
              {symbolOut}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-muted)]">Minimum after slippage</dt>
            <dd className="tabular-nums">
              {Number(formatUnits(minOut, decimalsOut)).toLocaleString(undefined, {
                maximumFractionDigits: 6,
              })}{' '}
              {symbolOut}
            </dd>
          </div>
          {quote.partial ? (
            <p className="text-amber-300">
              This buy completes the curve. You will be charged only for what you receive and
              refunded {formatUnits(quote.refund, quoteDecimals)} {quoteSymbol}.
            </p>
          ) : null}
          {snipeTaxBps > 0n ? (
            <p className="text-amber-300">
              Opening-window tax of {formatBps(snipeTaxBps)} applies to this buy. The estimate above
              does not include it — the simulated result does.
            </p>
          ) : null}
        </dl>
      ) : null}

      <button
        onClick={submit}
        disabled={disabled}
        className="btn-primary mt-4 w-full px-3 py-2.5 text-sm"
      >
        {!isConnected
          ? 'Connect a wallet to trade'
          : wrongNetwork
            ? 'Switch to Robinhood Chain'
            : insufficient
              ? `Not enough ${symbolIn}`
              : needsApproval
                ? `Approve ${symbolIn}`
                : side === 'buy'
                  ? `Buy ${tokenSymbol}`
                  : `Sell ${tokenSymbol}`}
      </button>

      <TxStatus phase={txPhase} hash={hash} message={txMessage} />

      {confirmed ? (
        <button
          onClick={() => {
            reset()
            setAmount('')
            void refetchCurve()
          }}
          className="mt-2 w-full text-xs text-[var(--color-muted)] underline"
        >
          Make another trade
        </button>
      ) : null}
    </section>
  )
}

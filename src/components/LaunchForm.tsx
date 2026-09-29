'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { decodeEventLog, formatEther, getAddress, isAddress, parseEther, type Address, type Hex } from 'viem'
import {
  useAccount,
  useBalance,
  useReadContracts,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import {
  CONTRACTS,
  NATIVE_QUOTE,
  ROBINHOOD_CHAIN_ID,
  curveMath,
  formatBps,
  v2FactoryAbi,
  v2RouterAbi,
} from '@/chain-adapter'
import { LogoUpload } from './LogoUpload'
import { TxStatus, readableError, type TxPhase } from './TxStatus'
import { shortAddress } from '@/lib/display'

const LAUNCH_CONFIG_ID = 0n
/** The factory's cap on the snipe-tax exemption list. */
const MAX_EXEMPTIONS = 32

function randomSalt(): Hex {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}` as Hex
}

const input = 'w-full rounded-lg px-3 py-2 text-sm'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium">{label}</span>
      {hint ? <span className="ml-2 text-[11px] text-[var(--color-muted)]">{hint}</span> : null}
      <div className="mt-1">{children}</div>
    </label>
  )
}

export function LaunchForm() {
  const router = useRouter()
  const { address, chainId, isConnected } = useAccount()
  const { data: balance } = useBalance({ address, query: { enabled: Boolean(address) } })

  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [logo, setLogo] = useState('')
  const [description, setDescription] = useState('')
  const [twitter, setTwitter] = useState('')
  const [telegram, setTelegram] = useState('')
  const [discord, setDiscord] = useState('')
  const [website, setWebsite] = useState('')
  const [farcaster, setFarcaster] = useState('')
  const [creatorTax, setCreatorTax] = useState('')
  const [creatorWallet, setCreatorWallet] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [exemptions, setExemptions] = useState<Address[]>([])
  const [exemptionDraft, setExemptionDraft] = useState('')
  const [exemptionError, setExemptionError] = useState<string | null>(null)
  const [devBuy, setDevBuy] = useState('')
  const [slippageBps] = useState(1000n)
  const [buyback, setBuyback] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [salt] = useState<Hex>(() => randomSalt())

  const wrongNetwork = isConnected && chainId !== ROBINHOOD_CHAIN_ID

  const factory = { address: CONTRACTS.v2Factory, abi: v2FactoryAbi } as const
  const { data: chainConfig } = useReadContracts({
    contracts: [
      { ...factory, functionName: 'launchFee' },
      { ...factory, functionName: 'getLaunchConfig', args: [LAUNCH_CONFIG_ID] },
      { ...factory, functionName: 'maxCreatorTaxBps' },
      { ...factory, functionName: 'previewLaunchEconomics', args: [LAUNCH_CONFIG_ID, NATIVE_QUOTE] },
      { ...factory, functionName: 'canLaunch', args: [address ?? NATIVE_QUOTE] },
      { ...factory, functionName: 'snipeTaxStartBps' },
      { ...factory, functionName: 'snipeTaxSeconds' },
    ],
    query: { refetchInterval: 30_000 },
  })

  const launchFee = chainConfig?.[0]?.result as bigint | undefined
  const launchConfig = chainConfig?.[1]?.result as
    | { supply: bigint; curveFeeBps: bigint; phantomQuote: bigint; graduationThreshold: bigint }
    | undefined
  const maxCreatorTaxBps = (chainConfig?.[2]?.result as bigint | undefined) ?? 1000n
  const expectedEconomics = chainConfig?.[3]?.result as Hex | undefined
  const canLaunch = chainConfig?.[4]?.result as boolean | undefined
  const snipeTaxStartBps = chainConfig?.[5]?.result as bigint | undefined
  const snipeTaxSeconds = chainConfig?.[6]?.result as bigint | undefined

  function addExemption() {
    const raw = exemptionDraft.trim()
    if (!raw) return
    if (!isAddress(raw, { strict: false }) || BigInt(raw) === 0n) {
      setExemptionError('Not a valid wallet address.')
      return
    }
    const addr = getAddress(raw)
    if (exemptions.some((a) => a.toLowerCase() === addr.toLowerCase())) {
      setExemptionError('Already on the list.')
      return
    }
    if (address && addr.toLowerCase() === address.toLowerCase()) {
      setExemptionError('Your own wallet is exempt already.')
      return
    }
    if (exemptions.length >= MAX_EXEMPTIONS) {
      setExemptionError(`The factory accepts at most ${MAX_EXEMPTIONS} wallets.`)
      return
    }
    setExemptions((list) => [...list, addr])
    setExemptionDraft('')
    setExemptionError(null)
  }

  const creatorTaxBps = useMemo(() => {
    const n = Math.round(Number(creatorTax || '0') * 100)
    if (!Number.isFinite(n) || n < 0) return 0
    return Math.min(n, Number(maxCreatorTaxBps))
  }, [creatorTax, maxCreatorTaxBps])

  /**
   * Where creator fees and the creator tax are credited in the escrow. Blank
   * means the connected wallet. The factory records this at launch; only the
   * recorded address can claim or reassign it, so a typo would strand fees.
   */
  const creatorWalletTrimmed = creatorWallet.trim()
  const creatorWalletInvalid =
    creatorWalletTrimmed.length > 0 &&
    (!isAddress(creatorWalletTrimmed, { strict: false }) ||
      BigInt(creatorWalletTrimmed) === 0n)
  const creatorFeeRecipient = (
    creatorWalletTrimmed && !creatorWalletInvalid
      ? getAddress(creatorWalletTrimmed)
      : (address ?? NATIVE_QUOTE)
  ) as Address
  const customRecipient =
    Boolean(address) && creatorFeeRecipient.toLowerCase() !== address?.toLowerCase()

  const curveFeeBps = launchConfig?.curveFeeBps
  const totalTradeBps = curveFeeBps !== undefined ? curveFeeBps + BigInt(creatorTaxBps) : undefined

  const devBuyWei = useMemo(() => {
    if (!devBuy.trim()) return 0n
    try {
      const v = parseEther(devBuy.trim())
      return v > 0n ? v : 0n
    } catch {
      return 0n
    }
  }, [devBuy])

  /**
   * What the opening buy would return, from the curve's starting reserves. The
   * curve begins at the phantom quote with the full supply, so this is exact
   * before anyone else has traded.
   */
  const devBuyEstimate = useMemo(() => {
    if (devBuyWei === 0n || !launchConfig) return null
    try {
      return curveMath.quoteBuy({
        quoteIn: devBuyWei,
        quoteReserve: launchConfig.phantomQuote,
        tokenReserve: launchConfig.supply,
        sellableTokens: launchConfig.supply,
        feeBps: launchConfig.curveFeeBps,
        creatorTaxBps: BigInt(creatorTaxBps),
      }).tokensOut
    } catch {
      return null
    }
  }, [devBuyWei, launchConfig, creatorTaxBps])

  const minTokensOut = devBuyEstimate
    ? curveMath.applySlippage(devBuyEstimate, slippageBps)
    : 0n

  const params = useMemo(
    () => ({
      name: name.trim(),
      symbol: symbol.trim(),
      logo: logo.trim(),
      description: description.trim(),
      socials: {
        twitter: twitter.trim(),
        telegram: telegram.trim(),
        discord: discord.trim(),
        website: website.trim(),
        farcaster: farcaster.trim(),
      },
      creatorFeeRecipient,
      creatorTaxBps,
      buybackEnabled: buyback,
      expectedEconomics: (expectedEconomics ?? `0x${'0'.repeat(64)}`) as Hex,
      salt,
    }),
    [name, symbol, logo, description, twitter, telegram, discord, website, farcaster,
     creatorFeeRecipient, creatorTaxBps, buyback, expectedEconomics, salt],
  )

  const valid = params.name.length > 0 && params.symbol.length > 0 && !creatorWalletInvalid
  const totalCost = (launchFee ?? 0n) + devBuyWei
  const withDevBuy = devBuyWei > 0n

  const ready =
    reviewing && valid && Boolean(address) && !wrongNetwork &&
    launchFee !== undefined && expectedEconomics !== undefined

  const withExemptions = exemptions.length > 0

  // Plain launch: factory, fee only. The 3-argument overload when nobody is
  // exempted, the 4-argument one when the list has entries.
  const plainSim = useSimulateContract({
    ...factory,
    functionName: 'launchToken',
    args: [params, LAUNCH_CONFIG_ID, NATIVE_QUOTE],
    value: launchFee,
    account: address,
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled: ready && !withDevBuy && !withExemptions, retry: false },
  })

  const exemptSim = useSimulateContract({
    ...factory,
    functionName: 'launchToken',
    args: [params, LAUNCH_CONFIG_ID, NATIVE_QUOTE, exemptions],
    value: launchFee,
    account: address,
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled: ready && !withDevBuy && withExemptions, retry: false },
  })

  // Launch with an opening buy: the router, fee + buy, plus the exemption list.
  const devSim = useSimulateContract({
    address: CONTRACTS.v2LaunchRouter,
    abi: v2RouterAbi,
    functionName: 'launchAndBuy',
    args: address
      ? [params, LAUNCH_CONFIG_ID, NATIVE_QUOTE, devBuyWei, minTokensOut, address, exemptions]
      : undefined,
    value: totalCost,
    account: address,
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled: ready && withDevBuy, retry: false },
  })

  const sim = withDevBuy ? devSim : withExemptions ? exemptSim : plainSim
  const { writeContract, data: hash, isPending: signing, error: writeError, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess: confirmed, data: receipt } =
    useWaitForTransactionReceipt({ hash })

  const launchedToken = useMemo(() => {
    if (!receipt) return null
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== CONTRACTS.v2Factory.toLowerCase()) continue
      try {
        const decoded = decodeEventLog({ abi: v2FactoryAbi, data: log.data, topics: log.topics })
        if (decoded.eventName === 'TokenLaunched') {
          return (decoded.args as unknown as { token: Address }).token
        }
      } catch {
        /* other event */
      }
    }
    return null
  }, [receipt])

  let txPhase: TxPhase = 'idle'
  let txMessage: string | undefined
  if (confirmed) txPhase = 'success'
  else if (confirming) txPhase = 'pending'
  else if (signing) txPhase = 'signing'
  else if (writeError) { txPhase = 'failed'; txMessage = readableError(writeError) }
  else if (ready && sim.isFetching) txPhase = 'simulating'
  else if (ready && sim.error) { txPhase = 'blocked'; txMessage = readableError(sim.error) }

  const insufficient = balance !== undefined && balance.value < totalCost

  if (confirmed) {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-[var(--color-accent)]">Launched</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {params.name} (${params.symbol}) is live and trading on its bonding curve.
        </p>
        <TxStatus phase="success" hash={hash} />
        {launchedToken ? (
          <button
            onClick={() => router.push(`/token?address=${launchedToken}`)}
            className="btn-accent mt-4 rounded-lg px-4 py-2 text-sm"
          >
            Open the token page
          </button>
        ) : null}
      </div>
    )
  }

  if (reviewing) {
    const rows: [string, string][] = [
      ['Contract', withDevBuy ? `Launch router ${CONTRACTS.v2LaunchRouter}` : `Factory ${CONTRACTS.v2Factory}`],
      ['Function', withDevBuy ? 'launchAndBuy(...)' : withExemptions ? 'launchToken(params, configId, pairToken, exemptions)' : 'launchToken(params, configId, pairToken)'],
      ['Name', params.name],
      ['Ticker', `$${params.symbol}`],
      ['Logo', params.logo || '(none)'],
      ['Quote asset', 'ETH (native)'],
      ['Total supply', launchConfig ? `${formatEther(launchConfig.supply)} ${params.symbol}` : '…'],
      ['Graduates at', launchConfig ? `${formatEther(launchConfig.graduationThreshold)} ETH` : '…'],
      ['Trade fee', launchConfig ? formatBps(launchConfig.curveFeeBps) : '…'],
      ['Creator wallet', customRecipient ? creatorFeeRecipient : `${creatorFeeRecipient} (you)`],
      ['Your creator tax', formatBps(BigInt(creatorTaxBps))],
      ...(totalTradeBps !== undefined
        ? ([['Traders pay in total', formatBps(totalTradeBps)]] as [string, string][])
        : []),
      ['Snipe tax exemptions', withExemptions ? exemptions.join(', ') : 'none (you only)'],
      ['Buyback and lock', params.buybackEnabled ? 'enabled' : 'disabled'],
      ['Launch fee', launchFee !== undefined ? `${formatEther(launchFee)} ETH` : '…'],
      ['Your opening buy', withDevBuy ? `${formatEther(devBuyWei)} ETH` : 'none'],
      ...(withDevBuy && devBuyEstimate
        ? ([['You would receive', `~${Number(formatEther(devBuyEstimate)).toLocaleString()} ${params.symbol}`]] as [string, string][])
        : []),
      ['Total to pay', `${formatEther(totalCost)} ETH`],
    ]
    return (
      <div className="space-y-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold">Review — exactly what gets signed</h2>
          <dl className="mt-3 space-y-1.5 text-xs">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="shrink-0 text-[var(--color-muted)]">{k}</dt>
                <dd className="break-all text-right font-mono text-[11px]">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11px] text-[var(--color-muted)]">
            Metadata is written on chain and is immutable. It cannot be edited after launch.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { setReviewing(false); reset() }}
            className="pill px-4 py-2 text-sm"
          >
            Back
          </button>
          <button
            onClick={() => sim.data?.request && writeContract(sim.data.request as never)}
            disabled={!sim.data || signing || confirming}
            className="btn-accent flex-1 rounded-lg px-4 py-2 text-sm"
          >
            {sim.isFetching ? 'Simulating…' : sim.error ? 'Simulation failed' : `Launch for ${formatEther(totalCost)} ETH`}
          </button>
        </div>

        <TxStatus phase={txPhase} hash={hash} message={txMessage} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" hint="required">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder="Doge Classic" />
        </Field>
        <Field label="Ticker" hint="required">
          <input className={input} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} maxLength={16} placeholder="DOGEC" />
        </Field>
      </div>

      <Field label="Logo">
        <LogoUpload value={logo} onChange={setLogo} />
      </Field>

      <Field label="Description">
        <textarea className={`${input} min-h-20`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Twitter"><input className={input} value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="https://x.com/…" /></Field>
        <Field label="Website"><input className={input} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" /></Field>
        <Field label="Telegram"><input className={input} value={telegram} onChange={(e) => setTelegram(e.target.value)} /></Field>
        <Field label="Discord"><input className={input} value={discord} onChange={(e) => setDiscord(e.target.value)} /></Field>
        <Field label="Farcaster"><input className={input} value={farcaster} onChange={(e) => setFarcaster(e.target.value)} /></Field>
      </div>

      <div className="card">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          aria-expanded={advancedOpen}
          className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium"
        >
          Advanced
          <span aria-hidden className={`text-xs text-[var(--color-muted)] transition-transform ${advancedOpen ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {advancedOpen || creatorWalletInvalid ? (
          <div className="space-y-4 border-t border-[var(--hairline)] px-3 pb-3 pt-3">
            <div>
              <Field label="Creator wallet">
                <input
                  className={`${input} font-mono`}
                  value={creatorWallet}
                  onChange={(e) => setCreatorWallet(e.target.value.trim())}
                  placeholder={address ? shortAddress(address) : '0x…'}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={creatorWalletInvalid}
                />
              </Field>
              <p className={`mt-1 text-[11px] ${creatorWalletInvalid ? 'text-red-300' : 'text-[var(--color-muted)]'}`}>
                {creatorWalletInvalid
                  ? 'Not a valid wallet address.'
                  : customRecipient
                    ? `Fees go to ${shortAddress(creatorFeeRecipient)}, not your connected wallet. Only that address can claim them. Check it carefully.`
                    : 'Receives creator fees and the creator tax. Leave blank to use your connected wallet.'}
              </p>
            </div>
            <div>
              <Field label="Creator tax">
                <div className="relative">
                  <input
                    className={`${input} pr-8`}
                    inputMode="decimal"
                    value={creatorTax}
                    onChange={(e) => setCreatorTax(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="0"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted)]">%</span>
                </div>
              </Field>
              <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                {totalTradeBps !== undefined
                  ? `Traders pay ${formatBps(totalTradeBps)} in total${creatorTaxBps > 0 ? `, ${formatBps(BigInt(creatorTaxBps))} of it yours` : ''}. Up to ${formatBps(maxCreatorTaxBps)}, permanent.`
                  : `0 – ${formatBps(maxCreatorTaxBps)}, yours, permanent.`}
                {Number(creatorTax || '0') * 100 > Number(maxCreatorTaxBps) ? ` Capped at ${formatBps(maxCreatorTaxBps)}.` : ''}
              </p>
            </div>
            <div>
              <span className="text-xs font-medium">Snipe tax exemptions</span>
              <div className="relative mt-1">
                <input
                  className={`${input} pr-12 font-mono`}
                  value={exemptionDraft}
                  onChange={(e) => { setExemptionDraft(e.target.value.trim()); setExemptionError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExemption() } }}
                  placeholder="0x wallet address"
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Add a snipe tax exempt wallet"
                  disabled={exemptions.length >= MAX_EXEMPTIONS}
                />
                <button
                  type="button"
                  onClick={addExemption}
                  disabled={!exemptionDraft || exemptions.length >= MAX_EXEMPTIONS}
                  aria-label="Add wallet"
                  className="pill absolute right-1.5 top-1/2 flex h-7 w-8 -translate-y-1/2 items-center justify-center text-sm"
                >
                  +
                </button>
              </div>
              {exemptions.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {exemptions.map((a) => (
                    <li key={a} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--color-blue-soft)] px-2.5 py-1 font-mono text-[11px]">
                      <span className="break-all">{a}</span>
                      <button
                        type="button"
                        onClick={() => setExemptions((list) => list.filter((x) => x !== a))}
                        aria-label={`Remove ${a}`}
                        className="shrink-0 text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className={`mt-1 text-[11px] ${exemptionError ? 'text-red-300' : 'text-[var(--color-muted)]'}`}>
                {exemptionError ??
                  `Buys in the launch second pay ${snipeTaxStartBps !== undefined ? formatBps(snipeTaxStartBps) : '99%'}, decaying to zero across ${snipeTaxSeconds !== undefined ? `${snipeTaxSeconds}s` : 'a few seconds'}. Declare the wallets your team opens with. Your own wallet is exempt already${exemptions.length ? ` · ${exemptions.length}/${MAX_EXEMPTIONS}` : ''}.`}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="card p-3">
        <Field label="Dev supply" hint="optional — your own opening buy, in the same transaction">
          <input
            className={input}
            inputMode="decimal"
            value={devBuy}
            onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.0 ETH"
          />
        </Field>
        {devBuyEstimate ? (
          <p className="mt-2 text-[11px] text-[var(--color-muted)]">
            ≈ {Number(formatEther(devBuyEstimate)).toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
            {symbol || 'tokens'} ({((Number(formatEther(devBuyEstimate)) / 1e9) * 100).toFixed(2)}% of supply).
            Buying in the same transaction also exempts you from the opening-window tax.
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-[var(--color-muted)]">
            Leave blank to launch without holding any of your own supply.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={buyback} onChange={(e) => setBuyback(e.target.checked)} />
        Enable buyback and lock (a share of fees buys the token back, vesting over five years)
      </label>

      {launchConfig ? (
        <dl className="card p-3 text-xs">
          <p className="mb-2 font-medium">Terms, read live from the factory</p>
          <div className="flex justify-between"><dt className="text-[var(--color-muted)]">Supply</dt><dd>{Number(formatEther(launchConfig.supply)).toLocaleString()}</dd></div>
          <div className="flex justify-between"><dt className="text-[var(--color-muted)]">Graduates at</dt><dd>{formatEther(launchConfig.graduationThreshold)} ETH</dd></div>
          <div className="flex justify-between"><dt className="text-[var(--color-muted)]">Trade fee</dt><dd>{formatBps(launchConfig.curveFeeBps)}</dd></div>
          <div className="flex justify-between"><dt className="text-[var(--color-muted)]">Launch fee</dt><dd>{launchFee !== undefined ? `${formatEther(launchFee)} ETH` : '…'}</dd></div>
        </dl>
      ) : null}

      {canLaunch === false ? (
        <p className="card border-red-900 p-3 text-xs text-red-300">
          This factory is not currently accepting launches from your address.
        </p>
      ) : null}

      <button
        onClick={() => setReviewing(true)}
        disabled={!valid || !isConnected || wrongNetwork || insufficient}
        className="btn-accent w-full rounded-lg px-4 py-2.5 text-sm"
      >
        {!isConnected ? 'Connect a wallet to launch'
          : wrongNetwork ? 'Switch to Robinhood Chain'
          : insufficient ? `Not enough ETH (need ${formatEther(totalCost)})`
          : creatorWalletInvalid ? 'Creator wallet is not a valid address'
          : !valid ? 'Name and ticker are required'
          : 'Review launch'}
      </button>
    </div>
  )
}

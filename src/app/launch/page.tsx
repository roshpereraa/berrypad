import { LaunchForm } from '@/components/LaunchForm'

export const metadata = { title: 'Create a coin — Berrypad' }

export default function LaunchPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Create a coin</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
        Your coin is created by pump.fun&apos;s own program on Solana, from your wallet. The full
        supply is minted to a bonding curve anyone can trade immediately, and the coin graduates
        onto PumpSwap once the curve sells out.
      </p>

      <div className="glass mt-6 p-6">
        <LaunchForm />
      </div>

      <div className="glass mt-5 !border-[var(--accent)]/25 p-5 text-xs text-[var(--color-ink)]/80">
        <p className="font-semibold">Before you launch</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>This is mainnet. There is nowhere to rehearse a launch.</li>
          <li>Name, ticker, logo and description are written on chain and cannot be changed.</li>
          <li>The creator tax is fixed at launch and can never be raised or lowered.</li>
          <li>The pump.fun program is third party. Berrypad deploys nothing of its own.</li>
        </ul>
      </div>
    </div>
  )
}

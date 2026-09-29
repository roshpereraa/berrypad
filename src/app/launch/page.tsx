import { LaunchForm } from '@/components/LaunchForm'

export const metadata = { title: 'Create a coin — Berrypad' }

export default function LaunchPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Create a coin</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
        Deploys through the launchpad factory on Robinhood Chain. Your full supply is minted to a
        bonding curve anyone can trade immediately, and the launch graduates into a locked Uniswap
        V4 pool once the curve sells out.
      </p>

      <div className="glass mt-6 p-6">
        <LaunchForm />
      </div>

      <div className="glass mt-5 !border-[var(--accent)]/25 p-5 text-xs text-[var(--color-ink)]/80">
        <p className="font-semibold">Before you launch</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>This is mainnet. There is no testnet for these contracts, so there is nowhere to rehearse.</li>
          <li>Name, ticker, logo and description are written on chain and cannot be changed.</li>
          <li>The creator tax is fixed at launch and can never be raised or lowered.</li>
          <li>The launchpad contracts are third-party and were unaudited at the time of writing.</li>
        </ul>
      </div>
    </div>
  )
}

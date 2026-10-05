import { CreatorFees } from '@/components/CreatorFees'

export const metadata = { title: 'Creator fees — Berrypad' }

export default function FeesPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Creator fees</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
        Every trade on a coin you created pays you a creator fee. It builds up in pump.fun&apos;s
        creator vault for your wallet, across all your coins, on the bonding curve and after
        graduation, until you claim it.
      </p>
      <div className="glass mt-6 p-6">
        <CreatorFees />
      </div>
    </div>
  )
}

import { LegalPage } from '@/components/LegalPage'

export const metadata = { title: 'Terms of Use — Berrypad' }

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Use"
      sections={[
        ['What Berrypad is', 'Berrypad is a web interface to public, permissionless smart contracts deployed on Robinhood Chain by a third party. We do not operate those contracts, control them, or have any ability to reverse, pause, or recover a transaction made through them.'],
        ['No custody', 'Berrypad never takes custody of your assets. Every action is a transaction your own wallet is asked to sign and broadcast. We hold no keys and cannot move, freeze, or return your funds. We cannot send you fees you have earned; those are claimed by you directly from the protocol.'],
        ['No advice', 'Nothing presented here is financial, investment, legal or tax advice. Listings, rankings, charts and figures are informational, derived from public chain data, and may be incomplete, delayed or wrong. Presence of a token in this interface is not an endorsement of it.'],
        ['User-created tokens', 'Anyone can create a token. Names, tickers and images can be copied, and are frequently copied in order to deceive. Always verify a contract address independently before transacting. We do not review, vet or approve tokens.'],
        ['Risk', 'Tokens created through these contracts are experimental and highly volatile. You may lose the entire value of anything you buy or create. The underlying contracts were unaudited at the time of writing. Smart contracts, wallets, RPC providers and indexers can all fail.'],
        ['Availability', 'The service is provided as-is, without warranty of any kind. We may change or discontinue it at any time. Data shown may be stale; the chain is the only authoritative source.'],
        ['Eligibility', 'Do not use this interface if doing so would breach the law where you are, or if you are subject to sanctions that prohibit it.'],
      ]}
    />
  )
}

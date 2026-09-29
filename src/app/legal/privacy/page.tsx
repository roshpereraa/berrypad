import { LegalPage } from '@/components/LegalPage'

export const metadata = { title: 'Privacy Policy — Berrypad' }

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      sections={[
        ['No accounts', 'Berrypad has no sign-up, no password and no user accounts. We do not ask for your name, email address or any other personal identifier, and we do not have one on file for you.'],
        ['Your wallet address', 'When you connect a wallet, the interface reads its public address in order to display balances and build transactions. That address is public information on a public blockchain. We do not link it to an identity and do not ask you to.'],
        ['What is stored', 'We operate an index of public on-chain data: token launches, trades and related events, all of which are already public and readable by anyone with a node. Nothing in that index originates with you rather than the chain.'],
        ['Images you upload', 'A token logo you upload is stored in public object storage and its URL is written into the token contract on chain, permanently and publicly. Do not upload anything you are not willing to publish irrevocably.'],
        ['Third parties', 'Using the interface causes your browser to contact third parties we do not control: public RPC endpoints, IPFS gateways, your wallet provider, and our hosting provider. Each sees your IP address under its own policy.'],
        ['Cookies and tracking', 'We set no advertising cookies and run no cross-site tracking. Your wallet connection preference may be kept in your own browser storage so you are not asked to reconnect on every visit.'],
        ['Requests', 'Because we hold no account data, there is generally nothing for us to export or delete on request. Data written to the blockchain cannot be deleted by us or by anyone.'],
      ]}
    />
  )
}

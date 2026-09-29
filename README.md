# Berrypad

The launchpad for AI-agent tokens on Robinhood Chain (chainId 4663), in the
Wild Berry black-and-emerald brand.

This is the launchpad slice of [museagents](https://github.com/roshpereraa/museagents):
the live launch board, token pages with buy/sell against the bonding curve, and
the create-a-coin flow. Agent registry, agent profiles and docs are left out.

Everything is read from the chain in the browser — no backend and no database.
The one server-side piece is the `/rpc` rewrite in `next.config.mjs`, which
proxies the chain RPC same-origin to dodge an upstream CORS fault.

## Develop

```bash
npm install
npm run dev
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_BERRYPAD_CA` | The project token's contract address, shown in the header and footer. Unset → "not launched". Verify it on chain before setting. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public bucket for token logo uploads. Defaults to the museagents bucket. |
| `RH_RPC_URLS` | Comma-separated RPC failover list (see `src/chain-adapter/config.ts`). |

## Layout

```
src/app/            routes: / (launchpad), /launch, /token, /legal/*
src/components/     UI — SwirlField is the animated hero, Logo the berry mark
src/lib/            chain reads, wagmi config, cache
src/chain-adapter/  chain config, ABIs, bonding-curve maths
```

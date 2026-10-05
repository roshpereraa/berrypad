/**
 * Simulates launches against pump.fun's live program with the site's own
 * instruction builders. Read-only: nothing is signed or sent, and the payer
 * is a funded public wallet used only as the simulated fee payer.
 */
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  type AddressLookupTableAccount,
  type TransactionInstruction,
} from '@solana/web3.js'
import BN from 'bn.js'
import {
  OnlinePumpSdk,
  PUMP_SDK,
  getBuyTokenAmountFromSolAmount,
} from '@pump-fun/pump-sdk'
import { NATIVE_MINT } from '@solana/spl-token'
import { eventsFromLogs } from '@/lib/sol/events'
import { BERRYPAD_LAUNCH_REGISTRY } from '@/lib/sol/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RPC = 'https://solana-rpc.publicnode.com'
/** pump.fun's own fee wallet: always funded, only ever a simulated payer here. */
const PAYER = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV')
const PUMP_TOKEN = new PublicKey('pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn')

async function simulate(conn: Connection, ixs: TransactionInstruction[], units: number, tables: AddressLookupTableAccount[] = []) {
  const { blockhash } = await conn.getLatestBlockhash()
  const msg = new TransactionMessage({
    payerKey: PAYER,
    recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units }), ...ixs],
  }).compileToV0Message(tables)
  const res = await conn.simulateTransaction(new VersionedTransaction(msg), { sigVerify: false, replaceRecentBlockhash: true })
  // The fee pump.fun actually records, from the simulated CreateEvent.
  const created = eventsFromLogs(res.value.logs ?? [], 'simulated').find((e) => e.kind === 'launch')
  return {
    recordedCreatorFeeBps: created && created.kind === 'launch' ? created.creatorFeeBps : null,
    ok: !res.value.err,
    err: res.value.err ?? null,
    units: res.value.unitsConsumed ?? null,
    tail: (res.value.logs ?? []).filter((l) => /Error|failed|Instruction:/.test(l)).slice(-6),
  }
}

export async function GET(): Promise<Response> {
  const conn = new Connection(RPC, 'confirmed')
  const sdk = new OnlinePumpSdk(conn)
  const [global, feeConfig, quoteControl] = await Promise.all([
    sdk.fetchGlobal(),
    sdk.fetchFeeConfig().catch(() => null),
    sdk.fetchQuoteControl().catch(() => null),
  ])
  const pumpQuote = await sdk.resolveQuoteMint(PUMP_TOKEN)
  const base = { name: 'Berrypad Test', symbol: 'BPTEST', uri: 'https://example.com/m.json', creator: PAYER, user: PAYER, mayhemMode: false }
  const results: Record<string, unknown> = {}

  // 1. SOL coin with a 0.01 SOL first buy (the default launch path).
  {
    const mint = Keypair.generate().publicKey
    const solAmount = new BN(10_000_000)
    const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: solAmount, quoteMint: NATIVE_MINT })
    const ixs = await PUMP_SDK.createV2AndBuyInstructions({ ...base, mint, global, amount, solAmount })
    results.solCreateAndBuy = await simulate(conn, ixs, 450_000)
  }

  // 2. Coin priced in PUMP with a 1% custom creator fee, no first buy.
  {
    const mint = Keypair.generate().publicKey
    const ix = await PUMP_SDK.createV2Instruction({
      ...base,
      mint,
      quoteMint: pumpQuote.mint,
      quoteTokenProgram: pumpQuote.quoteTokenProgram,
      creatorFeeBps: new BN(100),
    })
    results.pumpQuotedCustomFee = await simulate(conn, [ix], 500_000)
  }

  // 3. Holder-reward SOL coin, no first buy.
  {
    const mint = Keypair.generate().publicKey
    const ix = await PUMP_SDK.createV2Instruction({ ...base, mint, holderReward: true })
    results.holderReward = await simulate(conn, [ix], 300_000)
  }

  // 4. SOL-priced coin asked for a 1% custom fee: does pump.fun keep it?
  {
    const mint = Keypair.generate().publicKey
    const ix = await PUMP_SDK.createV2Instruction({ ...base, mint, creatorFeeBps: new BN(100) })
    results.solWithCustomFee = await simulate(conn, [ix], 300_000)
  }

  // 5. Coin priced in hSOL (Helius Staked SOL) with a 1% custom fee.
  {
    const hsol = await sdk.resolveQuoteMint(new PublicKey('he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A'))
    const mint = Keypair.generate().publicKey
    const ix = await PUMP_SDK.createV2Instruction({
      ...base,
      mint,
      quoteMint: hsol.mint,
      quoteTokenProgram: hsol.quoteTokenProgram,
      creatorFeeBps: new BN(100),
    })
    results.hsolWithCustomFee = await simulate(conn, [ix], 500_000)
  }

  // 6. Worst-case size: 32-char name, 10-char ticker, a real pump.fun
  //    metadata link, with a first buy. Over the limit means the launch form
  //    must split create and buy, which it does.
  {
    const mint = Keypair.generate().publicKey
    const long = {
      ...base,
      name: 'A'.repeat(32),
      symbol: 'B'.repeat(10),
      uri: 'https://ipfs.io/ipfs/bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku',
    }
    const solAmount = new BN(10_000_000)
    const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: solAmount, quoteMint: NATIVE_MINT })
    const combined = await PUMP_SDK.createV2AndBuyInstructions({ ...long, mint, global, amount, solAmount })
    const createOnly = await PUMP_SDK.createV2Instruction({ ...long, mint })
    const size = (ixs: TransactionInstruction[]) =>
      new VersionedTransaction(
        new TransactionMessage({
          payerKey: PAYER,
          recentBlockhash: PublicKey.default.toBase58(),
          instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 450_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }), ...ixs],
        }).compileToV0Message(),
      ).serialize().length
    results.worstCaseBytes = { createAndBuy: size(combined), createOnly: size([createOnly]), limit: 1232 }

    // The same worst case through pump.fun launches' shared lookup table,
    // with the Berrypad launch marker, as the launch form now sends it.
    const alt = (await conn.getAddressLookupTable(new PublicKey('Hyif6eWb8x88RVrvjPfabsgRYnwkVnyByEXTVTXbUcyP'))).value
    const marker = SystemProgram.transfer({ fromPubkey: PAYER, toPubkey: BERRYPAD_LAUNCH_REGISTRY, lamports: 0 })
    if (alt) {
      const withMarker = [...combined, marker]
      const altSize = new VersionedTransaction(
        new TransactionMessage({
          payerKey: PAYER,
          recentBlockhash: PublicKey.default.toBase58(),
          instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 450_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }), ...withMarker],
        }).compileToV0Message([alt]),
      ).serialize().length
      results.worstCaseWithLookupTable = { bytes: altSize, active: alt.isActive(), sim: await simulate(conn, withMarker, 450_000, [alt]) }
    } else {
      results.worstCaseWithLookupTable = { error: 'lookup table not found' }
    }
    results.worstCaseCreateOnly = await simulate(conn, [createOnly], 300_000)
  }

  // 7. The default launch: priced in WBTC with a 3% creator tax. The program
  //    must record 300, and create + first buy must fit through the lookup table.
  {
    const wbtc = await sdk.resolveQuoteMint(new PublicKey('3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh'))
    const mint = Keypair.generate().publicKey
    const wb = {
      ...base,
      name: 'A'.repeat(32),
      symbol: 'B'.repeat(10),
      uri: 'https://ipfs.io/ipfs/bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku',
      mint,
      quoteMint: wbtc.mint,
      quoteTokenProgram: wbtc.quoteTokenProgram,
      creatorFeeBps: new BN(300),
    }
    const create = await PUMP_SDK.createV2Instruction(wb)
    const quoteAmount = new BN(70_000)
    const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: quoteAmount, quoteMint: wbtc.mint, quoteControl, creatorFeeBps: new BN(300) } as never)
    const both = await PUMP_SDK.createV2AndBuyV2Instructions({ ...wb, global, amount, quoteAmount })
    const alt = (await conn.getAddressLookupTable(new PublicKey('Hyif6eWb8x88RVrvjPfabsgRYnwkVnyByEXTVTXbUcyP'))).value
    let bytes: number | string = 'no lookup table'
    if (alt) {
      try {
        bytes = new VersionedTransaction(
          new TransactionMessage({
            payerKey: PAYER,
            recentBlockhash: PublicKey.default.toBase58(),
            instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }), ...both],
          }).compileToV0Message([alt]),
        ).serialize().length
      } catch (e) {
        bytes = String(e)
      }
    }
    results.wbtcCustomTax = { create: await simulate(conn, [create], 500_000), worstCaseCreateAndBuyBytes: bytes, limit: 1232 }
  }

  results.quoteControlLoaded = quoteControl !== null
  return Response.json(results, { headers: { 'cache-control': 'no-store' } })
}

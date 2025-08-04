// scripts/utils/trace_cupsyy_history.ts (optimerad för pooltracking + 10h + throttling)
import { Connection, PublicKey, ParsedMessageAccount, ParsedInstruction, ConfirmedSignatureInfo } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = 'https://solana-mainnet.core.chainstack.com/4050a13fe14e6fdc43430faf2c01f015';
const connection = new Connection(RPC_URL);

const CUPSYY_WALLET = new PublicKey('suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK');

const PROGRAM_IDS = {
  launchlab: 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj',
};

function log(msg: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

interface PoolRecord {
  sig: string;
  slot: number;
  ts: number | null;
  mint: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function main() {
  const cutoffTime = Math.floor(Date.now() / 1000) - 10 * 3600;
  let before: string | undefined = undefined;
  const outPath = path.join(__dirname, '../../data/cupsyy_pools.json');

  let pools: PoolRecord[] = [];
  let totalChecked = 0;
  let skippedNoTime = 0;

  while (true) {
    const signatures: ConfirmedSignatureInfo[] = await connection.getSignaturesForAddress(CUPSYY_WALLET, { limit: 1000, before });
    if (signatures.length === 0) break;

    const relevant = signatures.filter(sig => sig.blockTime && sig.blockTime >= cutoffTime);
    totalChecked += relevant.length;
    if (relevant.length === 0) break;

    const batches = chunk(relevant, 5);
    for (const batch of batches) {
      await new Promise(res => setTimeout(res, 200));

      const results = await Promise.allSettled(batch.map(sigInfo =>
        connection.getParsedTransaction(sigInfo.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        }).then(tx => ({ tx, sigInfo }))
      ));

      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        const { tx, sigInfo } = result.value;

        if (!tx?.transaction || !tx.meta || tx.meta.err !== null) continue;
        if ((tx.meta.postTokenBalances ?? []).length === 0) continue;
        if ((tx.meta.logMessages ?? []).some(l => l.includes('Instruction: Memo'))) continue;

        const accountKeys = tx.transaction.message.accountKeys.map((k: ParsedMessageAccount) => k.pubkey);
        const instructions = tx.transaction.message.instructions as ParsedInstruction[];

        const programKeys = instructions.map(ix => {
          try {
            return 'programId' in ix ? ix.programId.toBase58() : '(okänd)';
          } catch (e) {
            return '(fel vid toBase58)';
          }
        });

        const matched = programKeys.includes(PROGRAM_IDS.launchlab);
        if (!matched) continue;

        const seen = new Set<string>();
        for (const t of tx.meta.postTokenBalances || []) {
          if (seen.has(t.mint)) continue;
          seen.add(t.mint);

          log(`📌 Pool: ${t.mint} @ ${new Date(sigInfo.blockTime! * 1000).toISOString()}`);
          pools.push({
            sig: sigInfo.signature,
            slot: tx.slot,
            ts: tx.blockTime ?? null,
            mint: t.mint,
          });
        }
      }
    }

    before = signatures.at(-1)?.signature;
  }

  fs.writeFileSync(outPath, JSON.stringify(pools, null, 2));
  log(`✅ Sparade ${pools.length} poolträffar till ${outPath}`);
  log(`🔍 Totalt skannat: ${totalChecked} (${skippedNoTime} utan tidsstämpel)`);
}

main().catch(e => log(`❌ Fel: ${e}`));

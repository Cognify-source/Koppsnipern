// scripts/utils/fetch_price_window.ts
import { Connection, ParsedConfirmedTransaction } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import cliProgress from 'cli-progress';

const RPC_URL = 'https://solana-mainnet.core.chainstack.com/4050a13fe14e6fdc43430faf2c01f015';
const connection = new Connection(RPC_URL);

interface PoolRecord {
  sig: string;
  slot: number;
  ts: number | null;
  mint: string;
}

interface PriceObservation {
  slot: number;
  sig: string;
  ts: number | null;
  mint: string;
  txSig: string;
  accounts: string[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const poolPath = path.join(__dirname, '../../data/cupsyy_pools.json');
  const outPath = path.join(__dirname, '../../data/cupsyy_pool_prices.json');

  const raw = fs.readFileSync(poolPath, 'utf8');
  const pools: PoolRecord[] = JSON.parse(raw);

  const output: Record<string, PriceObservation[]> = {};

  const poolBar = new cliProgress.SingleBar({
    format: 'Analyserar pool {bar} {percentage}% | {value}/{total} pooler',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  poolBar.start(pools.length, 0);

  for (const pool of pools) {
    const { mint, slot, sig, ts } = pool;
    output[mint] = [];
    const slotRange = Array.from({ length: 120 }, (_, i) => slot + i);
    const batches = chunk(slotRange, 10);

    for (const batch of batches) {
      await delay(200);

      const results = await Promise.allSettled(batch.map(async s => {
        try {
          const block = await connection.getBlock(s, {
            maxSupportedTransactionVersion: 0,
          });
          if (!block) return [];

          const txMatches: PriceObservation[] = [];
          for (const txSig of block.transactions.map(tx => tx.transaction.signatures[0])) {
            const parsedTx: ParsedConfirmedTransaction | null = await connection.getParsedTransaction(txSig, {
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0,
            });
            if (!parsedTx) continue;

            const accounts = parsedTx.transaction.message.accountKeys.map(k => k.pubkey.toBase58());
            if (accounts.includes(mint)) {
              txMatches.push({
                slot: s,
                sig,
                ts,
                mint,
                txSig,
                accounts,
              });
            }
          }
          return txMatches;
        } catch (e) {
          console.warn(`⚠️ Misslyckades att hämta/parsa slot ${s}:`, e);
          return [];
        }
      }));

      for (const r of results) {
        if (r.status === 'fulfilled') {
          output[mint].push(...r.value);
        }
      }
    }

    poolBar.increment();
  }

  poolBar.stop();
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`📦 Sparade till ${outPath}`);
}

main().catch(err => console.error('❌ Fel i scriptet:', err));

// scripts/utils/fetch_price_window.ts
import { Connection, ParsedConfirmedTransaction, PublicKey, ParsedMessageAccount, VersionedBlockResponse } from '@solana/web3.js';
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

async function safeGetParsedTransactions(signatures: string[]): Promise<(ParsedConfirmedTransaction | null)[]> {
  const maxRetries = 5;
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await connection.getParsedTransactions(signatures, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
    } catch (e: any) {
      if (e?.code === -32005) {
        const waitMs = parseInt(e?.data?.try_again_in || '500', 10);
        console.warn(`⏳ RPS-limit, väntar ${waitMs}ms...`);
        await delay(waitMs);
        attempt++;
      } else {
        throw e;
      }
    }
  }
  throw new Error('❌ Max antal retries överskridet');
}

async function main() {
  const poolPath = path.join(__dirname, '../../data/cupsyy_pools.json');
  const outPath = path.join(__dirname, '../../data/cupsyy_pool_prices.json');

  const raw = fs.readFileSync(poolPath, 'utf8');
  const pools: PoolRecord[] = JSON.parse(raw);

  const output: Record<string, PriceObservation[]> = {};
  const blockCache = new Map<number, VersionedBlockResponse>();

  const poolBar = new cliProgress.SingleBar({
    format: 'Analyserar pool {bar} {percentage}% | {value}/{total} pooler',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  poolBar.start(pools.length, 0);

  const limitedPools = pools.slice(0, 1); // ta bort slice() för att köra alla

  for (const pool of limitedPools) {
    const { mint, slot, sig, ts } = pool;
    console.log(`🔍 Bearbetar mint: ${mint} @ slot ${slot}`);
    output[mint] = [];

    let endReached = false;
    let nextSlot = slot;
    const dynamicSlots: number[] = [];

    while (!endReached) {
      try {
        const t0 = Date.now();
        const block = await connection.getBlock(nextSlot, {
          maxSupportedTransactionVersion: 0,
        });
        const t1 = Date.now();

        if (!block || !block.blockTime) {
          nextSlot += 1;
          continue;
        }

        console.log(`📘 Hämtar slot ${nextSlot} (blockTime: ${block.blockTime}) [${(t1 - t0)}ms]`);
        dynamicSlots.push(nextSlot);
        blockCache.set(nextSlot, block);

        if (block.blockTime > (ts ?? 0) + 120) {
          endReached = true;
        } else {
          nextSlot += 1;
        }

        await delay(25); // throttling
      } catch (e) {
        console.warn(`⚠️ Misslyckades att hämta slot ${nextSlot}:`, e);
        nextSlot += 1;
      }
    }

    const batches = chunk(dynamicSlots, 5);

    for (const batch of batches) {
      await delay(25);
      const batchStart = Date.now();

      const results = await Promise.allSettled(batch.map(async s => {
        try {
          const block = blockCache.get(s);
          if (!block) return [];

          console.log(`⏳ Slot ${s} hämtad, ${block.transactions.length} tx`);

          const txSigs = block.transactions.map((tx: any) => tx.transaction.signatures[0]);
          const txChunks = chunk(txSigs, 10);
          const txMatches: PriceObservation[] = [];

          for (const group of txChunks) {
            console.log(`🔎 Bearbetar ${group.length} transaktioner från slot ${s}`);

            const parsedTxs = await safeGetParsedTransactions(group as string[]);

            parsedTxs.forEach((parsedTx, i) => {
              if (!parsedTx) return;
              const accounts = parsedTx.transaction.message.accountKeys.map((k: ParsedMessageAccount) => k.pubkey.toBase58());
              if (accounts.includes(mint)) {
                txMatches.push({
                  slot: s,
                  sig,
                  ts,
                  mint,
                  txSig: group[i] as string,
                  accounts,
                });
              }
            });
          }

          console.log(`✅ Träffar i slot ${s}: ${txMatches.length}`);
          return txMatches;
        } catch (e) {
          console.warn(`⚠️ Misslyckades att hämta/parsa slot ${s}:`, e);
          return [];
        }
      }));

      const batchEnd = Date.now();
      console.log(`⏱️ Batch klar på ${batchEnd - batchStart} ms`);

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

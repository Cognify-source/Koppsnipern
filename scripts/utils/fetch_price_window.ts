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
    format: 'Pool {mint} | {bar} {percentage}% | {value}/{total} pooler',
    hideCursor: true,
    autopadding: true,
    barsize: 30
  }, cliProgress.Presets.shades_classic);

  poolBar.start(pools.length, 0, { mint: '' });

  const limitedPools = pools.slice(0, 1); // ta bort slice() för att köra alla

  for (const pool of limitedPools) {
    const { mint, slot, sig, ts } = pool;
    poolBar.update({ mint });
    output[mint] = [];

    const endTime = (ts ?? 0) + 120;
    const dynamicSlots: number[] = [];
    let currentSlot = slot;
    let reachedEndTime = false;

    while (!reachedEndTime) {
      const block = await connection.getBlock(currentSlot, { maxSupportedTransactionVersion: 0 });
      if (block) {
        blockCache.set(currentSlot, block);
        dynamicSlots.push(currentSlot);
        if (block.blockTime && block.blockTime > endTime) {
          reachedEndTime = true;
        }
      }
      currentSlot++;
      await delay(25);
    }

    const batches = chunk(dynamicSlots, 5);
    let slotCounter = 0;

    for (const batch of batches) {
      await delay(25);

      const results = await Promise.allSettled(batch.map(async s => {
        try {
          const block = blockCache.get(s);
          if (!block) return [];

          const txSigs = block.transactions.map((tx: any) => tx.transaction.signatures[0]);
          const txChunks = chunk(txSigs, 10);
          const txMatches: PriceObservation[] = [];

          const chunkResults = await Promise.all(
            txChunks.map(async group => {
              return await safeGetParsedTransactions(group as string[]);
            })
          );

          chunkResults.flat().forEach((parsedTx, i) => {
            if (!parsedTx) return;
            const accounts = parsedTx.transaction.message.accountKeys.map((k: ParsedMessageAccount) => k.pubkey.toBase58());
            if (accounts.includes(mint)) {
              txMatches.push({
                slot: s,
                sig,
                ts,
                mint,
                txSig: parsedTx.transaction.signatures[0],
                accounts,
              });
            }
          });

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

      slotCounter++;
      if (slotCounter % 10 === 0) {
        fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
        global.gc?.();
      }
    }

    poolBar.increment();
  }

  poolBar.stop();
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`📦 Sparade till ${outPath}`);
}

main().catch(err => console.error('❌ Fel i scriptet:', err));

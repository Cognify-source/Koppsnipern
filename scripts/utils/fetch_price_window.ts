// scripts/utils/fetch_price_window.ts
import {
  Connection,
  ParsedConfirmedTransaction,
  ParsedMessageAccount,
  VersionedBlockResponse
} from '@solana/web3.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import cliProgress from 'cli-progress';
import * as dotenv from 'dotenv';
dotenv.config();

const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL);

interface PoolRecord {
  sig: string;
  slot: number;
  ts: number | null;
  mint: string;
}

interface PriceObservation {
  slot: number;
  txSig: string;
  ts: number | null;
  mint: string;
  accounts: string[];
  isCupsyy: boolean;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      if (e?.code === -32005 || e?.message?.includes("429")) {
        const waitMs = 1000;
        console.warn(`⏳ Rate limit (429), väntar ${waitMs}ms...`);
        await delay(waitMs);
        attempt++;
      } else {
        throw e;
      }
    }
  }
  throw new Error('❌ Max antal retries överskridet');
}

async function fetchWindowForPool(pool: PoolRecord, blockCache: Map<number, VersionedBlockResponse>, slotBar: cliProgress.SingleBar): Promise<PriceObservation[]> {
  const { mint, slot, ts, sig } = pool;
  const endTime = (ts ?? 0) + 120;
  const dynamicSlots: number[] = [];
  let currentSlot = slot;

  while (true) {
    const block = await connection.getBlock(currentSlot, { maxSupportedTransactionVersion: 0 });
    if (!block) {
      console.warn(`⚠️ Misslyckades hämta block ${currentSlot}`);
    } else {
      blockCache.set(currentSlot, block);
      dynamicSlots.push(currentSlot);
      if (block.blockTime && block.blockTime > endTime) break;
    }
    currentSlot++;
    await delay(50);
  }

  const result: PriceObservation[] = [];
  slotBar.start(dynamicSlots.length, 0);
  let counter = 0;

  for (const batch of chunk(dynamicSlots, 5)) {
    await delay(50);
    for (const slot of batch) {
      const block = blockCache.get(slot);
      if (!block) continue;
      const txSigs = block.transactions.map((tx: any) => tx.transaction.signatures[0]);
      const chunked = chunk(txSigs, 10);
      for (const group of chunked) {
        const txs = await safeGetParsedTransactions(group);
        for (const tx of txs) {
          if (!tx) continue;
          const accounts = tx.transaction.message.accountKeys.map((k: ParsedMessageAccount) => k.pubkey.toBase58());
          const txSig = tx.transaction.signatures[0];
          result.push({
            slot,
            txSig,
            ts: tx.blockTime || null,
            mint,
            accounts,
            isCupsyy: txSig === sig,
          });
        }
      }
      counter++;
      slotBar.update(counter);
    }
  }

  slotBar.stop();
  return result;
}

export async function run(limit?: number) {
  const poolPath = path.join(__dirname, '../../data/cupsyy_pools.json');
  const outPath = path.join(__dirname, '../../data/cupsyy_pool_prices.json');
  const raw = await fs.readFile(poolPath, 'utf8');
  const pools: PoolRecord[] = JSON.parse(raw);
  const selected = limit ? pools.slice(0, limit) : pools;
  const output: Record<string, PriceObservation[]> = {};
  const blockCache = new Map<number, VersionedBlockResponse>();

  const poolBar = new cliProgress.SingleBar({
    format: 'Pool {mint} | {bar} {percentage}% | {value}/{total}',
    hideCursor: true,
    autopadding: true,
    barsize: 30,
  }, cliProgress.Presets.shades_classic);

  poolBar.start(selected.length, 0, { mint: '' });

  let poolCount = 0;
  for (const pool of selected) {
    const slotBar = new cliProgress.SingleBar({
      format: `  Slot Scan | {bar} {percentage}% | {value}/{total}`,
      hideCursor: true,
      autopadding: true,
      barsize: 30,
    }, cliProgress.Presets.shades_classic);

    poolBar.update({ mint: pool.mint });
    output[pool.mint] = await fetchWindowForPool(pool, blockCache, slotBar);
    poolCount++;
    poolBar.update(poolCount);

    if (poolCount % 50 === 0) {
      console.log(`💾 Sparar delresultat (${poolCount} pooler)`);
      await fs.writeFile(outPath, JSON.stringify(output, null, 2));
    }
    global.gc?.();
  }

  poolBar.stop();
  await fs.writeFile(outPath, JSON.stringify(output, null, 2));
  console.log(`📦 Slutresultat sparat till ${outPath}`);
}

if (require.main === module) {
  const argLimit = process.argv.includes('--limit')
    ? parseInt(process.argv[process.argv.indexOf('--limit') + 1] || '0', 10)
    : undefined;
  run(argLimit).catch((err) => console.error('❌ Fel i scriptet:', err));
}

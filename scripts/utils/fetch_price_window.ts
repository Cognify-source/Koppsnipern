// scripts/utils/fetch_price_window.ts
import {
  Connection,
  ParsedConfirmedTransaction,
  ParsedMessageAccount,
  VersionedBlockResponse
} from '@solana/web3.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { performance } from 'perf_hooks';
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

async function fetchWindowForPool(pool: PoolRecord, blockCache: Map<number, VersionedBlockResponse>): Promise<PriceObservation[]> {
  const { mint, slot, ts } = pool;
  const endTime = (ts ?? 0) + 120;
  const dynamicSlots: number[] = [];
  let currentSlot = slot;

  console.log(`🟡 Startar scanning av pool ${mint} från slot ${slot}...`);

  while (true) {
    const block = await connection.getBlock(currentSlot, { maxSupportedTransactionVersion: 0 });
    if (!block) {
      console.warn(`⚠️ Misslyckades hämta block ${currentSlot}`);
    } else {
      blockCache.set(currentSlot, block);
      dynamicSlots.push(currentSlot);
      console.log(`  📦 Block ${currentSlot} | BlockTime: ${block.blockTime}`);
      if (block.blockTime && block.blockTime > endTime) break;
    }
    currentSlot++;
    await delay(50);
  }

  console.log(`🔍 Scannar ${dynamicSlots.length} slots...`);

  const result: PriceObservation[] = [];

  for (const s of dynamicSlots) {
    const slotStart = performance.now();

    const block = blockCache.get(s);
    if (!block) continue;

    const txSigs = block.transactions.map((tx: any) => tx.transaction.signatures[0]);
    const txChunks = chunk(txSigs, 10);

    let cupsyyHitsInSlot = 0;

    for (const group of txChunks) {
      await delay(50);
      const parsedList = await safeGetParsedTransactions(group as string[]);
      parsedList.forEach((parsedTx) => {
        if (!parsedTx) return;
        const accounts = parsedTx.transaction.message.accountKeys.map((k: ParsedMessageAccount) => k.pubkey.toBase58());
        if (accounts.includes(pool.mint)) {
          const isCupsyy = accounts.includes("suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK");
          result.push({
            slot: s,
            txSig: parsedTx.transaction.signatures[0],
            ts,
            mint,
            accounts,
            isCupsyy
          });
          if (isCupsyy) cupsyyHitsInSlot++;
        }
      });
    }

    const ms = (performance.now() - slotStart).toFixed(1);
    const blockTime = block.blockTime ?? 0;
    const txCount = block.transactions.length;

    console.log(`  ✅ Slot ${s} | BlockTime: ${blockTime} | ${ms}ms | ${txCount} txs | ${cupsyyHitsInSlot} cupsyy | ${result.length} träffar totalt`);
  }

  console.log(`✅ Pool ${mint} färdig. Totalt ${result.length} observationer.`);

  return result;
}

async function run(limit?: number) {
  const poolPath = path.join(__dirname, '../../data/cupsyy_pools.json');
  const raw = await fs.readFile(poolPath, 'utf8');
  const pools: PoolRecord[] = JSON.parse(raw);
  const selected = typeof limit === 'number' ? pools.slice(0, limit) : pools;

  const blockCache = new Map<number, VersionedBlockResponse>();
  console.log(`🚀 Startar analys av ${selected.length} pooler...\n`);

  for (const [i, pool] of selected.entries()) {
    console.log(`\n🔸 [${i + 1}/${selected.length}] Pool ${pool.mint}`);
    const start = performance.now();

    const result = await fetchWindowForPool(pool, blockCache);

    const outPath = path.join(__dirname, `../../data/pool_chunks/${pool.mint}.json`);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(result, null, 2));

    const duration = ((performance.now() - start) / 1000).toFixed(1);
    console.log(`💾 Sparad till: ${outPath}`);
    console.log(`⏱️  Klar på ${duration}s`);

    global.gc?.();
  }

  console.log('\n✅ Alla pooler färdigscannade.');
}

if (require.main === module) {
  const argLimit = process.argv.includes('--limit')
    ? parseInt(process.argv[process.argv.indexOf('--limit') + 1] || '0', 10)
    : undefined;
  run(argLimit).catch((err) => console.error('❌ Fel i scriptet:', err));
}

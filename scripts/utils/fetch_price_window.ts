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
console.log(`🔌 Använder RPC: ${RPC_URL}`);
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

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
  ]);
}

async function asyncMapWithDelay<T, U>(arr: T[], fn: (item: T) => Promise<U>, delayMs: number, timeoutMs = 20000): Promise<(U | null)[]> {
  const result: (U | null)[] = [];
  for (const item of arr) {
    const t0 = Date.now();
    let res: U | null = null;
    let err: any = null;
    try {
      res = await withTimeout(fn(item), timeoutMs);
    } catch (e) {
      err = e;
    }
    const dt = Date.now() - t0;
    if (res) {
      console.log(`🔎 asyncMapWithDelay: slot=${item}, block=OK, tid: ${dt} ms`);
    } else if (err) {
      console.error(`❌ asyncMapWithDelay: slot=${item}, ERROR:`, err, `tid: ${dt} ms`);
    } else {
      console.warn(`⚠️ asyncMapWithDelay: slot=${item}, block=NULL (timeout eller RPC-fel), tid: ${dt} ms`);
    }
    result.push(res);
    await delay(delayMs);
  }
  return result;
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

async function fetchWindowForPool(pool: PoolRecord, blockCache: Map<number, VersionedBlockResponse>, poolFile: string): Promise<PriceObservation[]> {
  const { mint, slot, ts } = pool;
  const endTime = (ts ?? 0) + 120;
  const dynamicSlots: number[] = [];
  const slotsToFetch: number[] = [];
  let currentSlot = slot;

  console.log(`🟡 Startar scanning av pool ${mint} från slot ${slot}...`);

  while (true) {
    slotsToFetch.push(currentSlot);
    currentSlot++;
    if (slotsToFetch.length >= 100) break; // Skydd mot oändlig loop vid saknad blockTime
  }

  const blocks = await asyncMapWithDelay(
    slotsToFetch,
    (s) => connection.getBlock(s, { maxSupportedTransactionVersion: 0 }),
    35,
    20000
  );

  for (let i = 0; i < slotsToFetch.length; i++) {
    const slot = slotsToFetch[i];
    const block = blocks[i];
    if (block) {
      blockCache.set(slot, block);
      dynamicSlots.push(slot);
      if (block.blockTime && block.blockTime > endTime) break;
    }
  }

  const result: PriceObservation[] = [];
  let slotCounter = 0;

  for (const s of dynamicSlots) {
    console.log(`➡️ Börjar slot ${s}...`);
    const slotStart = performance.now();
    const block = blockCache.get(s);
    if (!block) continue;
    const txSigs = block.transactions.map((tx: any) => tx.transaction.signatures[0]);
    const txChunks = chunk(txSigs, 10);

    for (const group of txChunks) {
      const parsedList = await safeGetParsedTransactions(group);
      await delay(35);
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
        }
      });
    }

    const ms = (performance.now() - slotStart).toFixed(1);
    console.log(`  ✅ Slot ${s} klar, tid: ${ms} ms, hittade ${result.length} observationer totalt`);

    slotCounter++;
    if (slotCounter % 50 === 0) {
      // Skriv till fil var 50:e slot
      await fs.writeFile(poolFile, JSON.stringify(result, null, 2));
      console.log(`💾 Sparade delresultat efter ${slotCounter} slots till ${poolFile}`);
    }
  }

  // Sista skrivningen om det inte är exakt multipel av 50
  await fs.writeFile(poolFile, JSON.stringify(result, null, 2));
  console.log(`💾 Slutresultat för pool ${mint} sparat till: ${poolFile}`);

  console.log(`✅ Pool ${mint} färdig. Totalt ${result.length} observationer.`);
  return result;
}

async function run(limit?: number) {
  const poolPath = path.join(__dirname, '../../data/cupsyy_pools.json');
  const raw = await fs.readFile(poolPath, 'utf8');
  const pools: PoolRecord[] = JSON.parse(raw);

  const outDir = path.join(__dirname, '../../data/pool_chunks');
  await fs.mkdir(outDir, { recursive: true });

  const blockCache = new Map<number, VersionedBlockResponse>();
  console.log(`🚀 Startar analys av ${pools.length} pooler...\n`);

  let output: Record<string, PriceObservation[]> = {};
  const outPath = path.join(__dirname, '../../data/cupsyy_pool_prices.json');
  try {
    const existing = await fs.readFile(outPath, 'utf8');
    output = JSON.parse(existing);
  } catch {
    output = {};
  }

  const selected = (limit ? pools.slice(0, limit) : pools).filter(p => !(p.mint in output));

  for (const [i, pool] of selected.entries()) {
    console.log(`\n🔸 [${i + 1}/${selected.length}] Pool ${pool.mint}`);
    const start = performance.now();

    const poolFile = path.join(outDir, `${pool.mint}.json`);
    const result = await fetchWindowForPool(pool, blockCache, poolFile);

    // Spara endast den nya poolens resultat till huvudfilen
    output[pool.mint] = result;
    await fs.writeFile(outPath, JSON.stringify({ ...output, [pool.mint]: result }, null, 2));

    const duration = ((performance.now() - start) / 1000).toFixed(1);
    console.log(`💾 Poolresultat även till: ${poolFile}`);
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

// fetch_price_movement.ts
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import cliProgress from 'cli-progress';

const RPC_URL = 'https://solana-mainnet.core.chainstack.com/4050a13fe14e6fdc43430faf2c01f015';
const connection = new Connection(RPC_URL);

const INPUT_FILE = path.join(__dirname, '../../data/cupsyy_pools.json');
const OUTPUT_FILE = path.join(__dirname, '../../data/price_movements.json');

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getBlockTime(slot: number): Promise<number | null> {
  try {
    return await connection.getBlockTime(slot);
  } catch {
    return null;
  }
}

async function getPricesForMint(mint: string, startSlot: number, endSlot: number): Promise<{ slot: number, price: number }[]> {
  const prices: { slot: number, price: number }[] = [];
  for (let slot = startSlot; slot <= endSlot; slot++) {
    try {
      const block = await connection.getBlock(slot, { transactionDetails: 'full' });
      if (!block?.transactions) continue;

      for (const tx of block.transactions) {
        for (const ix of tx.transaction.message.compiledInstructions) {
          const programId = tx.transaction.message.staticAccountKeys[ix.programIdIndex]?.toBase58();
          const accounts = ix.accountKeyIndexes.map(i => tx.transaction.message.staticAccountKeys[i]?.toBase58());

          // Naiv heuristik: om mint-adress förekommer i instruktionen = potentiell relevant swap
          if (accounts.includes(mint)) {
            // Simulerad pris: 1 WSOL = X SPL, här dummydata (du ersätter med riktig parsing senare)
            const price = Math.random() * (1.2 - 0.8) + 0.8; // dummy: mellan 0.8–1.2
            prices.push({ slot, price });
          }
        }
      }
    } catch {}
    await delay(10);
  }
  return prices;
}

async function main() {
  const raw = fs.readFileSync(INPUT_FILE, 'utf-8');
  const poolTxs = JSON.parse(raw);
  const output: any[] = [];

  const bar = new cliProgress.SingleBar({ clearOnComplete: true }, cliProgress.Presets.shades_classic);
  bar.start(poolTxs.length, 0);

  for (const entry of poolTxs) {
    const baseMint = entry.accounts?.[1]; // antag att [1] = mint
    const startSlot = entry.slot;
    const endSlot = startSlot + 120; // ca 60 sekunder = 120 slots

    const prices = await getPricesForMint(baseMint, startSlot, endSlot);
    if (prices.length >= 2) {
      const roi = ((prices.at(-1)!.price - prices[0].price) / prices[0].price) * 100;
      output.push({
        signature: entry.signature,
        mint: baseMint,
        fromSlot: startSlot,
        toSlot: endSlot,
        initialPrice: prices[0].price,
        finalPrice: prices.at(-1)!.price,
        roi: parseFloat(roi.toFixed(2)),
        prices,
      });
    }
    bar.increment();
  }

  bar.stop();

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Saved price movement data to ${OUTPUT_FILE}`);
}

main().catch(console.error);

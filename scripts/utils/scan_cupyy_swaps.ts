// scripts/utils/scan_cupsyy_swaps.ts
import { Connection } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import cliProgress from 'cli-progress';

const RPC_URL = 'https://solana-mainnet.core.chainstack.com/4050a13fe14e6fdc43430faf2c01f015';
const connection = new Connection(RPC_URL);

const inputPath = path.join(__dirname, '../../data/launchlab_pools.json');
const outputPath = path.join(__dirname, '../../data/cupsyy_swaps.json');
const cupsyyWallet = 'suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK';

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const raw = fs.readFileSync(inputPath, 'utf-8');
  const poolTxs = JSON.parse(raw);

  const results: any[] = [];

  const bar = new cliProgress.SingleBar({ clearOnComplete: true }, cliProgress.Presets.shades_classic);
  bar.start(poolTxs.length, 0);

  for (const pool of poolTxs) {
    const mint = pool.accounts?.[1]; // antag att mint ligger på index 1
    const startSlot = pool.slot + 1;
    const endSlot = startSlot + 120;

    for (let slot = startSlot; slot <= endSlot; slot++) {
      try {
        const block = await connection.getBlock(slot, {
          maxSupportedTransactionVersion: 0,
          transactionDetails: 'full',
          rewards: false,
        });
        if (!block?.transactions) continue;

        for (const tx of block.transactions) {
          const signers = tx.transaction.message.staticAccountKeys
            ?.slice(0, tx.transaction.message.header.numRequiredSignatures)
            .map(k => k.toBase58()) ?? [];

          if (signers.includes(cupsyyWallet)) {
            results.push({
              poolSignature: pool.signature,
              poolSlot: pool.slot,
              mint,
              matchedSlot: slot,
              txSignature: tx.transaction.signatures[0],
            });
            console.log(`✅ Cupsyy swap found: ${tx.transaction.signatures[0]} (slot ${slot})`);
          }
        }
      } catch (e) {
        console.warn(`Slot ${slot} error:`, (e as Error).message);
      }
      await delay(10);
    }

    bar.increment();
  }

  bar.stop();

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved ${results.length} Cupsyy swap(s) to ${outputPath}`);
}

main().catch(console.error);

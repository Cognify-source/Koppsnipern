// scripts/utils/filter_cupsyy_participation.ts
import { Connection } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import cliProgress from 'cli-progress';

const RPC_URL = 'https://solana-mainnet.core.chainstack.com/4050a13fe14e6fdc43430faf2c01f015';
const connection = new Connection(RPC_URL);

const inputPath = path.join(__dirname, '../../data/launchlab_pools.json');
const outputPath = path.join(__dirname, '../../data/cupsyy_pools.json');
const cupsyyWallet = 'suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK';

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const raw = fs.readFileSync(inputPath, 'utf-8');
  const poolTxs = JSON.parse(raw);

  const cupsyyTxs: any[] = [];

  const bar = new cliProgress.SingleBar({ clearOnComplete: true }, cliProgress.Presets.shades_classic);
  bar.start(poolTxs.length, 0);

  for (const entry of poolTxs) {
    try {
      const tx = await connection.getTransaction(entry.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });
      if (!tx?.transaction) {
        bar.increment();
        await delay(10);
        continue;
      }

      const signers = tx.transaction.message.staticAccountKeys
        ?.slice(0, tx.transaction.message.header.numRequiredSignatures)
        .map(k => k.toBase58()) ?? [];

      if (signers.includes(cupsyyWallet)) {
        console.log(`✅ Cupsyy participated: ${entry.signature} (slot ${entry.slot})`);
        cupsyyTxs.push({ ...entry, signer: cupsyyWallet });
      }
    } catch (e) {
      console.warn(`Failed to fetch tx ${entry.signature}:`, e);
    }
    bar.increment();
    await delay(10);
  }

  bar.stop();

  console.log(`\nFound ${cupsyyTxs.length} transactions with Cupsyy.`);
  fs.writeFileSync(outputPath, JSON.stringify(cupsyyTxs, null, 2));
  console.log(`Saved to ${outputPath}`);
}

main().catch(console.error);

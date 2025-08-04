// scripts/utils/scan_launchlab_rpc.ts
import { Connection, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import cliProgress from 'cli-progress';

const LAUNCHLAB_PROGRAM_ID = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');
const RPC_URL = 'https://solana-mainnet.core.chainstack.com/4050a13fe14e6fdc43430faf2c01f015';
const connection = new Connection(RPC_URL);

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseSlotArg(flag: string): number | null {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) return parseInt(process.argv[idx + 1]);
  return null;
}

async function main() {
  const fromSlot = parseSlotArg('--fromSlot');
  const toSlot = parseSlotArg('--toSlot');

  if (fromSlot === null || toSlot === null || isNaN(fromSlot) || isNaN(toSlot)) {
    console.error('❌ Ange både --fromSlot och --toSlot, t.ex:');
    console.error('   npx ts-node scan_launchlab_rpc.ts --fromSlot 350000000 --toSlot 350100000');
    process.exit(1);
  }

  const outputPath = path.join(__dirname, `../../data/launchlab_pools_${fromSlot}-${toSlot}.json`);
  const matches: { slot: number; signature: string }[] = [];

  console.log(`🔍 Scanning slots ${fromSlot} → ${toSlot}`);
  const bar = new cliProgress.SingleBar({ clearOnComplete: true }, cliProgress.Presets.shades_classic);
  bar.start(toSlot - fromSlot + 1, 0);

  for (let slot = fromSlot; slot <= toSlot; slot++) {
    try {
      const block = await connection.getBlock(slot, {
        maxSupportedTransactionVersion: 0,
        transactionDetails: 'full',
        rewards: false,
      });

      if (!block?.transactions) {
        bar.increment();
        continue;
      }

      for (const tx of block.transactions) {
        const message = tx.transaction.message;
        const staticKeys = message.staticAccountKeys || [];

        for (const ix of message.compiledInstructions) {
          const programId = staticKeys[ix.programIdIndex];

          const isLikelyPoolCreate =
            programId?.equals(LAUNCHLAB_PROGRAM_ID) &&
            ix.accountKeyIndexes.length >= 8 &&
            ix.data.length > 20;

          if (isLikelyPoolCreate) {
            matches.push({
              slot,
              signature: tx.transaction.signatures[0],
            });
          }
        }
      }
    } catch (e: unknown) {
      const msg = (e as Error).message || String(e);
      if (msg.includes('Block not available')) {
        bar.increment();
        continue;
      }
      console.warn(`⚠️ Slot ${slot} error:`, msg);
    }

    bar.increment();
    await delay(10);
  }

  bar.stop();
  console.log(`✅ Found ${matches.length} pool-create transactions`);
  fs.writeFileSync(outputPath, JSON.stringify(matches, null, 2));
  console.log(`💾 Saved to ${outputPath}`);
}

main().catch(console.error);

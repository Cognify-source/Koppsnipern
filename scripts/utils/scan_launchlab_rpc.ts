// scripts/utils/scan_launchlab_rpc.ts
import { Connection, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import cliProgress from 'cli-progress';

const RPC_URL = 'https://solana-mainnet.core.chainstack.com/4050a13fe14e6fdc43430faf2c01f015';
const connection = new Connection(RPC_URL);

const LAUNCHLAB_PROGRAM_ID = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');
const MAX_SLOTS = 500;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const startSlot = await connection.getSlot('finalized');
  const scanFromSlot = startSlot - MAX_SLOTS + 1;

  console.log(`Scanning from slot ${scanFromSlot} to ${startSlot}`);

  const matches: any[] = [];
  const totalSlots = startSlot - scanFromSlot + 1;

  const bar = new cliProgress.SingleBar({ clearOnComplete: true }, cliProgress.Presets.shades_classic);
  bar.start(totalSlots, 0);

  for (let slot = scanFromSlot; slot <= startSlot; slot++) {
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
              programId: programId.toBase58(),
              accounts: ix.accountKeyIndexes.map(i => staticKeys[i]?.toBase58()),
              dataLength: ix.data.length,
              data: ix.data,
            });
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message?.includes('Block not available')) {
        bar.increment();
        continue;
      }
      console.error(`Slot ${slot} error:`, e);
    }
    bar.increment();
    await delay(10);
  }

  bar.stop();

  const outputDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'launchlab_pools.json');

  console.log(`Found ${matches.length} likely PoolCreate transactions.`);
  fs.writeFileSync(outputPath, JSON.stringify(matches, null, 2));
  console.log(`Saved to ${outputPath}`);
}

main().catch(console.error);

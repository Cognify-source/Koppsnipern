// scan_launchlab_rpc.ts
import { Connection, PublicKey, MessageCompiledInstruction } from '@solana/web3.js';

const RPC_URL = 'https://solana-mainnet.core.chainstack.com/4050a13fe14e6fdc43430faf2c01f015';
const connection = new Connection(RPC_URL);

const LAUNCHLAB_PROGRAM_ID = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');
const DAYS_BACK = 30;
const SECONDS_IN_DAY = 86400;

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - DAYS_BACK * SECONDS_IN_DAY;

  const startSlot = await connection.getSlot('finalized');
  const currentBlockTime = await connection.getBlockTime(startSlot);
  const slotDuration = 0.4;
  const slotsBack = Math.floor((now - startTime) / slotDuration);
  const scanFromSlot = startSlot - slotsBack;

  console.log(`Scanning from slot ${scanFromSlot} to ${startSlot}`);

  const matches: any[] = [];

  for (let slot = scanFromSlot; slot <= startSlot; slot++) {
    try {
      const block = await connection.getBlock(slot, {
        maxSupportedTransactionVersion: 0,
      });
      if (!block?.transactions) continue;

      for (const tx of block.transactions) {
        const message = tx.transaction.message;
        const accountKeys = message.getAccountKeys();

        for (const ix of message.compiledInstructions) {
          const programId = accountKeys.get(ix.programIdIndex);
          if (programId?.equals(LAUNCHLAB_PROGRAM_ID)) {
            matches.push({
              slot,
              signature: tx.transaction.signatures[0],
              programId: programId.toBase58(),
              accounts: ix.accountKeyIndexes.map(i => accountKeys.get(i)?.toBase58()),
              data: ix.data,
            });
          }
        }
      }
    } catch (e) {
      if (e.message?.includes('Block not available')) continue;
      console.error(`Slot ${slot} error:`, e);
    }
  }

  console.log(`Found ${matches.length} transactions using LaunchLab program.`);
  console.log(JSON.stringify(matches, null, 2));
}

main().catch(console.error);

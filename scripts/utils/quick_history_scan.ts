// scripts/utils/quick_history_scan.ts
import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://api.mainnet-beta.solana.com'; // Testa officiella först!
const connection = new Connection(RPC_URL);

const CUPSYY_WALLET = new PublicKey('suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK');
const DAYS_BACK = 30;
const cutoffTime = Math.floor(Date.now() / 1000) - DAYS_BACK * 24 * 3600;

async function main() {
  let before: string | undefined = undefined;
  let total = 0;
  while (true) {
    const signatures = await connection.getSignaturesForAddress(CUPSYY_WALLET, {
      limit: 1000,
      before,
    });
    if (signatures.length === 0) break;

    const oldest = signatures[signatures.length - 1]?.blockTime;
    const newest = signatures[0]?.blockTime;
    total += signatures.length;

    console.log(
      `Batch: ${total} | Oldest: ${oldest} (${oldest ? new Date(oldest * 1000).toISOString() : "?"}) | Newest: ${newest} (${newest ? new Date(newest * 1000).toISOString() : "?"})`
    );

    // Om cutoff nåtts – stoppa
    if (oldest && oldest < cutoffTime) {
      console.log("🛑 Cutoff time nådd.");
      break;
    }

    before = signatures[signatures.length - 1].signature;
  }
  console.log(`Klar. Totalt hämtade signaturer: ${total}`);
}

main().catch(console.error);

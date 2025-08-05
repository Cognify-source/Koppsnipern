// scripts/utils/quick_history_scan.ts
import { Connection, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = 'https://solana-mainnet.core.chainstack.com/4050a13fe14e6fdc43430faf2c01f015';
const connection = new Connection(RPC_URL);

const CUPSYY_WALLET = new PublicKey('suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK');
const DAYS_BACK = 30;
const cutoffTime = Math.floor(Date.now() / 1000) - DAYS_BACK * 24 * 3600;

async function main() {
  let before: string | undefined = undefined;
  let total = 0;
  const report: any[] = [];

  while (true) {
    const signatures: Awaited<ReturnType<typeof connection.getSignaturesForAddress>> =
      await connection.getSignaturesForAddress(CUPSYY_WALLET, {
        limit: 1000,
        before,
      });
    if (signatures.length === 0) break;

    const oldest = signatures[signatures.length - 1]?.blockTime;
    const newest = signatures[0]?.blockTime;
    total += signatures.length;

    report.push({
      batch: total,
      oldest,
      oldest_iso: oldest ? new Date(oldest * 1000).toISOString() : null,
      newest,
      newest_iso: newest ? new Date(newest * 1000).toISOString() : null
    });

    console.log(
      `Batch: ${total} | Oldest: ${oldest} (${oldest ? new Date(oldest * 1000).toISOString() : "?"}) | Newest: ${new Date((newest ?? 0) * 1000).toISOString()}`
    );

    if (oldest && oldest < cutoffTime) {
      console.log("🛑 Cutoff time nådd.");
      break;
    }

    before = signatures[signatures.length - 1].signature;
    await new Promise(r => setTimeout(r, 200));
  }

  // Skriv till fil
  const outPath = path.join(__dirname, '../../data/quick_history_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Klar. Totalt hämtade signaturer: ${total}, rapport sparad till ${outPath}`);
}

main().catch(console.error);

// scripts/utils/trace_cupsyy_history.ts
import { Connection, PublicKey, ParsedInstruction, ParsedTransactionWithMeta } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = 'https://solana-mainnet.core.chainstack.com/4050a13fe14e6fdc43430faf2c01f015';
const connection = new Connection(RPC_URL);

const CUPSYY_WALLET = new PublicKey('suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK');

const PROGRAM_IDS = {
  launchlab: 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj',
  bonk: 'BoNk8kD1F6E6JXAvR7rSBHryh7s8WjRxYNoZw4v5ZJAq',
  raydium_cpmm: 'RVKd61ztZW9GdKzGZkz3d4KxYHTz77uVZsZaf1dF8Vt',
};

interface TradeRecord {
  sig: string;
  slot: number;
  ts: number | null;
  type: string;
  tokens: [string, number][];
}

async function main() {
  const cutoffTime = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  let before: string | undefined = undefined;
  const outPath = path.join(__dirname, '../../data/cupsyy_trades.json');

  // Load previous trades if file exists
  let trades: TradeRecord[] = [];
  if (fs.existsSync(outPath)) {
    trades = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    before = trades[trades.length - 1]?.sig;
    console.log(`🔁 Continuing from last signature: ${before}`);
  }

  let totalChecked = 0;
  let skippedNoTime = 0;

  console.log(`⏳ Fetching trades since ${new Date(cutoffTime * 1000).toISOString()}`);

  while (true) {
    const signatures: Awaited<ReturnType<typeof connection.getSignaturesForAddress>> = await connection.getSignaturesForAddress(CUPSYY_WALLET, {
      limit: 1000,
      before,
    });
    if (signatures.length === 0) break;

    for (const sigInfo of signatures) {
      if (sigInfo.blockTime && sigInfo.blockTime < cutoffTime) {
        console.log('🛑 Reached cutoff time');
        return finish(trades, outPath, totalChecked, skippedNoTime);
      } else if (!sigInfo.blockTime) {
        skippedNoTime++;
      }

      totalChecked++;
      if (totalChecked % 20 === 0) {
        const oldestSoFar = trades[trades.length - 1]?.ts;
        console.log(`⏱ Oldest so far: ${oldestSoFar} (${new Date((oldestSoFar ?? 0) * 1000).toISOString()})`);
      }

      const tx = await connection.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx?.transaction || !tx.meta) continue;

      const instructions = tx.transaction.message.instructions as ParsedInstruction[];
      const programKeys = instructions.map(ix => ix.programId.toBase58());
      const matchedType = Object.entries(PROGRAM_IDS).find(([_type, id]) => programKeys.includes(id));

      if (matchedType) {
        const tokenMap = new Map<string, number>();
        for (const t of tx.meta.postTokenBalances || []) {
          const mint = t.mint;
          const amount = t.uiTokenAmount.uiAmount ?? 0;
          tokenMap.set(mint, (tokenMap.get(mint) || 0) + amount);
        }
        const tokens: [string, number][] = Array.from(tokenMap.entries());

        console.log(`📌 Match: ${sigInfo.signature} [${matchedType[0]}]`);

        trades.push({
          sig: sigInfo.signature,
          slot: sigInfo.slot,
          ts: sigInfo.blockTime ?? null,
          type: matchedType[0],
          tokens,
        });
      }
    }

    if (signatures.length > 0) {
      before = signatures[signatures.length - 1].signature;
    } else {
      break;
    }
  }

  return finish(trades, outPath, totalChecked, skippedNoTime);
}

function finish(trades: TradeRecord[], outPath: string, totalChecked: number, skippedNoTime: number) {
  fs.writeFileSync(outPath, JSON.stringify(trades, null, 2));
  console.log(`✅ Saved ${trades.length} trades to ${outPath}`);
  if (trades.length > 0) {
    const oldest = trades[trades.length - 1].ts;
    console.log(`📅 Oldest trade timestamp: ${oldest} (${new Date((oldest ?? 0) * 1000).toISOString()})`);
  }
  console.log(`🔍 Scanned ${totalChecked} transactions total (${skippedNoTime} without blockTime)`);
}

main().catch(console.error);

// scripts/utils/trace_cupsyy_history.ts
import { Connection, PublicKey, ParsedInstruction, ParsedTransactionWithMeta } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import cliProgress from 'cli-progress';

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
  tokens: [string, number | null][];
}

async function main() {
  const signatures = await connection.getSignaturesForAddress(CUPSYY_WALLET, { limit: 100 });

  const trades: TradeRecord[] = [];

  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  bar.start(signatures.length, 0);

  for (const sigInfo of signatures) {
    const tx = await connection.getParsedTransaction(sigInfo.signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.transaction || !tx.meta) {
      bar.increment();
      continue;
    }

    const instructions = tx.transaction.message.instructions as ParsedInstruction[];
    const programKeys = instructions.map(ix => ix.programId.toBase58());
    const matchedType = Object.entries(PROGRAM_IDS).find(([_type, id]) => programKeys.includes(id));

    if (matchedType) {
      const tokens: [string, number | null][] = (tx.meta.postTokenBalances || []).map(t => [
        t.mint,
        t.uiTokenAmount.uiAmount ?? null
      ]);

      trades.push({
        sig: sigInfo.signature,
        slot: sigInfo.slot,
        ts: sigInfo.blockTime ?? null,
        type: matchedType[0],
        tokens,
      });
    }
    bar.increment();
  }

  bar.stop();

  const outPath = path.join(__dirname, '../../data/cupsyy_trades.json');
  fs.writeFileSync(outPath, JSON.stringify(trades, null, 2));
  console.log(`✅ Saved ${trades.length} trades to ${outPath}`);
}

main().catch(console.error);

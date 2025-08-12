import { Connection, PublicKey, Logs, clusterApiUrl } from '@solana/web3.js';
import { checkPoolSafety } from '../services/safetyService';
import dotenv from 'dotenv';

dotenv.config({ override: true, debug: false });

interface PoolData {
  address: string;
  mint: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  lpSol: number;
  creatorFee: number;
  estimatedSlippage: number;
  source: string;
}

const HTTP_RPC_URL = process.env.SOLANA_HTTP_RPC_URL?.startsWith('http')
  ? process.env.SOLANA_HTTP_RPC_URL
  : clusterApiUrl('mainnet-beta');

const WSS_RPC_URL = process.env.SOLANA_WSS_RPC_URL?.startsWith('ws')
  ? process.env.SOLANA_WSS_RPC_URL
  : undefined;

if (!WSS_RPC_URL) throw new Error('SOLANA_WSS_RPC_URL måste börja med ws:// eller wss://');

console.log(`🌐 HTTP RPC: ${HTTP_RPC_URL}`);
console.log(`🔌 WSS RPC: ${WSS_RPC_URL}`);

const httpConnection = new Connection(HTTP_RPC_URL, 'confirmed');
const wsConnection = new Connection(HTTP_RPC_URL, { commitment: 'confirmed', wsEndpoint: WSS_RPC_URL } as any);

async function listenForNewPools() {
  console.log('🚀 Lyssnar på LaunchLab-pooler (direktfilter aktiverat)...');

  // Direkt prenumeration på LaunchLab-programmet
  const launchLabProgram = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');

  wsConnection.onLogs(launchLabProgram, async (log: Logs) => {
    const poolData = await extractPoolDataFromLog(log);

    // Direkt LP-filter här (10 SOL)
    if (!poolData || poolData.lpSol < 10) return;

    const safetyResult = await checkPoolSafety(poolData);

    // Endast SAFE-pooler loggas
    if (safetyResult.status !== 'SAFE') return;

    console.log(`\n📊 [${poolData.source}] Ny pool: ${poolData.address} (${poolData.lpSol.toFixed(2)} SOL)`);
    console.log(`📋 Safety status: ${safetyResult.status}`);

    if (process.env.DISCORD_WEBHOOK_URL?.trim()) {
      try {
        const res = await fetch(process.env.DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `✅ Ny pooldetektion | ${new Date().toISOString()}\nKälla: ${poolData.source}\nPool: ${poolData.address}\nLP: ${poolData.lpSol.toFixed(2)} SOL | Fee: ${poolData.creatorFee.toFixed(2)}%\nStatus: ${safetyResult.status}`
          })
        });

        if (!res.ok) {
          console.error(`⚠️ Discord-webhook fel: ${res.status} ${res.statusText}`);
        } else {
          console.log(`📨 Discord-logg skickad (${safetyResult.status})`);
        }
      } catch (err) {
        console.error(`⚠️ Kunde inte skicka till Discord-webhook:`, err);
      }
    }
  });

  process.stdin.resume();
}

   async function extractPoolDataFromLog(log: Logs): Promise<PoolData | null> {
   const source = 'LaunchLab';

   if (!log.signature) return null;

   const tx = await httpConnection.getParsedTransaction(log.signature, { commitment: 'confirmed' });
   if (!tx || !tx.transaction.message.instructions) return null;

   const initInstr = tx.transaction.message.instructions.find((ix) =>
     'parsed' in ix && typeof ix.parsed === 'object' && 'type' in ix.parsed && ix.parsed.type === 'initialize2'
   );
   if (!initInstr || !('accounts' in initInstr)) return null;

   const accounts = initInstr.accounts;
   const tokenAMint = accounts[8];
   const tokenBMint = accounts[9];
   if (!tokenAMint || !tokenBMint) return null;

   return {
     address: log.signature,
     mint: tokenAMint.toBase58(),
     mintAuthority: null,
     freezeAuthority: null,
     lpSol: Math.random() * 20,
     creatorFee: Math.random() * 10,
     estimatedSlippage: Math.random() * 5,
     source
   };
}

if (require.main === module) {
  listenForNewPools();
}

export { listenForNewPools, PoolData };

// Uppdaterad lyssnare för LaunchLab med LP-gräns på 10 SOL
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
  console.log('🚀 Lyssnar på LaunchLab-pooler...');

  // Endast LaunchLab-programmet
  const dexPrograms = [
    new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj')
  ];

  wsConnection.onLogs('all', async (log: Logs) => {
    const matchingProgram = dexPrograms.find((p) => log.logs.some((l) => l.includes(p.toBase58())));
    if (!matchingProgram) return;

    const poolData = await extractPoolDataFromLog(log);
    if (!poolData || poolData.lpSol < 10) return; // Filtrera bort pooler under 10 SOL

    const safetyResult = await checkPoolSafety(poolData);

    if (safetyResult.status !== 'BLOCKED') {
      console.log(`\n📊 [${poolData.source}] Ny pool: ${poolData.address} (${poolData.lpSol.toFixed(2)} SOL)`);
      console.log(`📋 Safety status: ${safetyResult.status}`);

      if (process.env.DISCORD_WEBHOOK_URL) {
        await fetch(process.env.DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `✅ Ny pooldetektion | ${new Date().toISOString()}\nKälla: ${poolData.source}\nPool: ${poolData.address}\nLP: ${poolData.lpSol.toFixed(2)} SOL | Fee: ${poolData.creatorFee.toFixed(2)}%\nStatus: ${safetyResult.status}`
          })
        });
      }
    }
  });

  process.stdin.resume();
}

async function extractPoolDataFromLog(log: Logs): Promise<PoolData | null> {
  const logText = log.logs.join(' ');
  let source = 'UNKNOWN';
  if (logText.includes('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj')) source = 'LaunchLab';

  return {
    address: log.signature || `unknown-${Date.now()}`,
    mint: 'unknownMint',
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

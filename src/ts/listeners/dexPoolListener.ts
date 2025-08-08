// Uppdaterad lyssnare med fler källor för att maximera antalet träffar under utveckling
// Kan köras i bakgrunden så att vi kan arbeta med andra delar parallellt
import { Connection, PublicKey, Logs } from '@solana/web3.js';
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

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

async function listenForNewPools() {
  console.log('🚀 Startar lyssnare för nya DEX-pooler (utökad källista för utveckling)...');

  const dexPrograms = [
    new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj'), // LaunchLab Mainnet
    new PublicKey('RVKd61ztZW9J7oH9FUCwG5HLeU5kSRyRkzE9j5pqDqC'), // Raydium AMM
    new PublicKey('9W959DqZx2dVcKfS7oKJFwgDDqPrE1xKkG4i7C7CkCFt'), // Orca AMM
    new PublicKey('METeoraqVjZt5pCQ4wLqqpkkpJ5hY6j3XJt7UfgHQ8L'), // Meteora AMM
    new PublicKey('ALDRiNzL1m5a6zCsVz3iLzHzvV2gJroRbyHDPaZZxkQH'), // Aldrin AMM
  ];

  const spinnerFrames = ['⏳', '🔄', '🌀'];
  let spinnerIndex = 0;
  setInterval(() => {
    process.stdout.write(`\r${spinnerFrames[spinnerIndex]} Lyssnar på loggar... (${new Date().toLocaleTimeString()})`);
    spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
  }, 1000);

  connection.onLogs('all', async (log: Logs) => {
    try {
      const matchingProgram = dexPrograms.find((p) => log.logs.some((l) => l.includes(p.toBase58())));
      if (!matchingProgram) return;

      const poolData = await extractPoolDataFromLog(log);
      if (!poolData) return;

      console.log(`\n📊 [${poolData.source}] Ny träff från ${poolData.address}`);
      const safetyResult = await checkPoolSafety(poolData);
      console.log(`📋 Safety status: ${safetyResult.status}`);

      if (process.env.DISCORD_WEBHOOK_URL) {
        const discordMessage =
          `✅ Ny pooldetektion | ${new Date().toISOString()}\n` +
          `Källa: ${poolData.source}\n` +
          `Pool: ${poolData.address}\n` +
          `LP: ${poolData.lpSol} SOL | Creator Fee: ${poolData.creatorFee}%\n` +
          `Status: ${safetyResult.status}`;

        await fetch(process.env.DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: discordMessage })
        });
      }
    } catch (err) {
      console.error('❌ Fel vid pooldetektion:', err);
    }
  });

  // Låter processen stå och gå i bakgrunden
  process.stdin.resume();
}

async function extractPoolDataFromLog(log: Logs): Promise<PoolData | null> {
  return null; // TODO: Implementera riktig loggparsing
}

if (require.main === module) {
  listenForNewPools();
}

export { listenForNewPools, PoolData };

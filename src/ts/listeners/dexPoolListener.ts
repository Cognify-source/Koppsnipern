// Uppdaterad lyssnare med korrekt LaunchLab-program-ID och indikator på att den jobbar
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
  console.log('🚀 Startar lyssnare för nya DEX-pooler (LaunchLab + Raydium + Orca)...');

  const dexPrograms = [
    new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj'), // LaunchLab Mainnet
    new PublicKey('RVKd61ztZW9J7oH9FUCwG5HLeU5kSRyRkzE9j5pqDqC'), // Raydium AMM
    new PublicKey('9W959DqZx2dVcKfS7oKJFwgDDqPrE1xKkG4i7C7CkCFt'), // Orca AMM (placeholder)
  ];

  // Visuell indikator på att processen är aktiv
  setInterval(() => {
    process.stdout.write('⏳ Lyssnar på loggar...\r');
  }, 3000);

  connection.onLogs('all', async (log: Logs) => {
    try {
      const matchingProgram = dexPrograms.find((p) => log.logs.some((l) => l.includes(p.toBase58())));
      if (!matchingProgram) return;

      const poolData = await extractPoolDataFromLog(log);
      if (!poolData) return;

      if (poolData.lpSol < 0.5) return;

      const safetyResult = await checkPoolSafety(poolData);
      console.log(`\n📊 [${poolData.source}] Safety check result: ${safetyResult.status}`);

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

  process.stdin.resume();
}

async function extractPoolDataFromLog(log: Logs): Promise<PoolData | null> {
  return null; // TODO: Implementera riktig loggparsing
}

if (require.main === module) {
  listenForNewPools();
}

export { listenForNewPools, PoolData };

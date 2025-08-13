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

  let heartbeatCounter = 1;
  setInterval(() => {
    console.log(`👂 DexPoolListener är aktiv och lyssnar... (kontroll #${heartbeatCounter})`);
    heartbeatCounter++;
  }, 15000); // 15 sekunders intervall

  // Direkt prenumeration på LaunchLab-programmet
  const launchLabProgram = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');

  wsConnection.onLogs(launchLabProgram, async (log: Logs) => {
    console.log(`\n[DEBUG] Logg mottagen från LaunchLab. Signature: ${log.signature}`);
    const poolData = await extractPoolDataFromLog(log);

    if (!poolData) {
      console.log(`[DEBUG] Kunde inte extrahera pooldata från logg.`);
      return;
    }

    console.log(`[DEBUG] Pooldata extraherad: LP=${poolData.lpSol.toFixed(2)} SOL, Fee=${poolData.creatorFee.toFixed(2)}%`);

    // Direkt LP-filter här (10 SOL)
    if (poolData.lpSol < 10) {
      console.log(`[DEBUG] Pool bortfiltrerad: För lite LP (${poolData.lpSol.toFixed(2)} SOL).`);
      return;
    }

    const safetyResult = await checkPoolSafety(poolData);

    // Endast SAFE-pooler loggas
    if (safetyResult.status !== 'SAFE') {
      console.log(`[DEBUG] Pool bortfiltrerad av safetyService: ${safetyResult.reasons.join(', ')}`);
      return;
    }

    console.log(`\n✅ [${poolData.source}] Ny SAFE-pool: ${poolData.address} (${poolData.lpSol.toFixed(2)} SOL)`);
    console.log(`📋 Safety status: ${safetyResult.status}`);

    if (process.env.DISCORD_WEBHOOK_URL?.trim()) {
      try {
        const res = await fetch(process.env.DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `✅ Ny SAFE-pooldetektion | ${new Date().toISOString()}\nKälla: ${poolData.source}\nPool: ${poolData.address}\nLP: ${poolData.lpSol.toFixed(2)} SOL | Fee: ${poolData.creatorFee.toFixed(2)}%\nStatus: ${safetyResult.status}`
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

  if (!log.signature) {
    console.log('[DEBUG_EXTRACT] Log saknar signatur.');
    return null;
  }

  const tx = await httpConnection.getParsedTransaction(log.signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });

  // För djupare analys, avkommentera följande rad för att se hela transaktionsobjektet:
  console.log('[DEBUG_EXTRACT] Hela transaktionsobjektet:', JSON.stringify(tx, null, 2));

  if (!tx) {
    console.log('[DEBUG_EXTRACT] Transaktionen (tx) är null.');
    return null;
  }

  if (!tx.transaction || !tx.transaction.message || !tx.transaction.message.instructions) {
    console.log('[DEBUG_EXTRACT] Transaktionens instruktioner (eller delar av sökvägen dit) saknas.');
    return null;
  }

  const initInstr = tx.transaction.message.instructions.find((ix) =>
    'parsed' in ix && typeof ix.parsed === 'object' && ix.parsed !== null && 'type' in ix.parsed && ix.parsed.type === 'initialize2'
  );

  if (!initInstr) {
    console.log('[DEBUG_EXTRACT] Hittade inte instruktionen `initialize2`.');
    return null;
  }

  if (!('accounts' in initInstr) || !initInstr.accounts) {
    console.log('[DEBUG_EXTRACT] `initialize2`-instruktionen saknar `accounts`.');
    return null;
  }

  const accounts = initInstr.accounts;
  const tokenAMint = accounts[8];
  const tokenBMint = accounts[9];

  if (!tokenAMint || !tokenBMint) {
    console.log('[DEBUG_EXTRACT] Mint-adresser (A eller B) saknas i kontona.');
    return null;
  }

  return {
    address: log.signature,
    mint: tokenAMint.toBase58(),
    mintAuthority: null,
    freezeAuthority: null,
    lpSol: Math.random() * 20, // Mock-värde
    creatorFee: Math.random() * 10, // Mock-värde
    estimatedSlippage: Math.random() * 5, // Mock-värde
    source
  };
}

if (require.main === module) {
  listenForNewPools();
}

export { listenForNewPools, PoolData };

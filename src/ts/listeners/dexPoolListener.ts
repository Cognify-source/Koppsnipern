import { Connection, PublicKey, Logs, clusterApiUrl, ParsedTransactionWithMeta } from '@solana/web3.js';
import { checkPoolSafety } from '../services/safetyService';
import dotenv from 'dotenv';
import * as mockPoolEvents from '../../tests/integration/data/mock-pool-events.json';
import * as fs from 'fs';

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
  creator?: string;
}

const HTTP_RPC_URL = process.env.SOLANA_HTTP_RPC_URL?.startsWith('http')
  ? process.env.SOLANA_HTTP_RPC_URL
  : clusterApiUrl('mainnet-beta');

const WSS_RPC_URL = process.env.SOLANA_WSS_RPC_URL?.startsWith('ws')
  ? process.env.SOLANA_WSS_RPC_URL
  : undefined;

if (!WSS_RPC_URL && process.env.USE_STUB_LISTENER !== 'true') {
  throw new Error('SOLANA_WSS_RPC_URL måste anges (eller kör i stub-läge)');
}

const httpConnection = new Connection(HTTP_RPC_URL, 'confirmed');
const wsConnection = WSS_RPC_URL ? new Connection(HTTP_RPC_URL, { commitment: 'confirmed', wsEndpoint: WSS_RPC_URL } as any) : null;

async function processLog(log: Logs | any) {
  console.log(`\n[DEBUG] Logg mottagen. Signature: ${log.signature}`);
  const poolData = await extractPoolDataFromLog(log);

  if (!poolData) {
    // Tyst i live-läge, men logga i stub-läge
    if (process.env.USE_STUB_LISTENER === 'true') {
      console.log(`[STUB_DEBUG] Kunde inte extrahera pooldata från logg.`);
    }
    return;
  }

  console.log(`[DEBUG] Pooldata extraherad: LP=${poolData.lpSol.toFixed(2)} SOL, Fee=${poolData.creatorFee.toFixed(2)}%`);

  if (poolData.lpSol < 10) {
    console.log(`[DEBUG] Pool bortfiltrerad: För lite LP (${poolData.lpSol.toFixed(2)} SOL).`);
    return;
  }

  const safetyResult = await checkPoolSafety(poolData);

  if (safetyResult.status !== 'SAFE') {
    console.log(`[DEBUG] Pool bortfiltrerad av safetyService: ${safetyResult.reasons.join(', ')}`);
    return;
  }

  console.log(`\n✅ [${poolData.source}] Ny SAFE-pool: ${poolData.address} (${poolData.lpSol.toFixed(2)} SOL)`);
  console.log(`📋 Safety status: ${safetyResult.status}`);

  // ... (resten av logiken för Discord-notis etc.)
}

async function listenForNewPools() {
  const useStubListener = process.env.USE_STUB_LISTENER === 'true';
  console.log(`🚀 Lyssnar på LaunchLab-pooler... ${useStubListener ? '[STUB-LÄGE AKTIVT]' : ''}`);

  setInterval(() => {
    console.log(`👂 DexPoolListener är aktiv...`);
  }, 15000);

  if (useStubListener) {
    console.log('[STUB] Startar stub-lyssnare. Spelar upp händelser från mock-fil...');
    let eventIndex = 0;
    const intervalId = setInterval(() => {
      if (eventIndex >= mockPoolEvents.length) {
        console.log('[STUB] Alla mock-händelser har spelats upp.');
        eventIndex = 0; // Loopa om från början
      }
      const mockLog = mockPoolEvents[eventIndex];
      console.log(`[STUB] Spelar upp mock-händelse #${eventIndex + 1}: ${mockLog.signature}`);
      processLog(mockLog);
      eventIndex++;
    }, 5000);
  } else {
    if (!wsConnection) {
      throw new Error("WebSocket-anslutning är inte tillgänglig för live-läge.");
    }
    const launchLabProgram = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');
    wsConnection.onLogs(launchLabProgram, processLog);
  }

  process.stdin.resume();
}

async function extractPoolDataFromLog(log: any): Promise<PoolData | null> {
  if (log.mockPoolData) {
    console.log('[STUB_EXTRACT] Använder mock-data för poolen.');
    return {
      address: log.signature,
      mint: `MOCK_MINT_FOR_${log.signature}`,
      source: 'stub',
      ...log.mockPoolData,
      estimatedSlippage: log.mockPoolData.estimatedSlippage || 0,
      creator: log.mockPoolData.creator || 'MockCreator'
    };
  }

  const source = 'LaunchLab';
  if (!log.signature) return null;

  const tx = log.txData as ParsedTransactionWithMeta || await httpConnection.getParsedTransaction(log.signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });

  if (!tx || !tx.transaction || !tx.transaction.message || !tx.transaction.message.instructions) {
    return null;
  }

  const initInstr = tx.transaction.message.instructions.find((ix: any) =>
    ix.parsed?.type === 'initialize2'
  );

  if (!initInstr) return null;

  const accounts = (initInstr as any).accounts;
  if (!accounts || accounts.length < 10) return null;

  const tokenAMint = accounts[8];
  const tokenBMint = accounts[9];

  if (!tokenAMint || !tokenBMint) return null;

  // Denna del är fortfarande en platshållare eftersom live-data inte är en ny pool
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

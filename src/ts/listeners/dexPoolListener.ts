import { Connection, PublicKey, Logs, clusterApiUrl, ParsedTransactionWithMeta } from '@solana/web3.js';
import { checkPoolSafety } from '../services/safetyService';
import dotenv from 'dotenv';
import * as mockPoolEvents from '../../../tests/integration/data/mock-pool-events.json';
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

  // Initial LP filter
  const minLpSol = Number(process.env.FILTER_MIN_LP_SOL) || 10;
  if (poolData.lpSol < minLpSol) {
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
    const pumpV1ProgramId = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
    console.log(`[INFO] Lyssnar på Pump.fun V1 programmet.`);
    wsConnection.onLogs(pumpV1ProgramId, processLog);
  }

  process.stdin.resume();
}

const PUMP_V1_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

async function extractPoolDataFromLog(log: any): Promise<PoolData | null> {
  if (log.mockPoolData) {
    console.log('[STUB_EXTRACT] Använder mock-data för poolen.');
    const validAddress = 'H58LpwwM3sW2F9kRHuaxrWeMB2hPuDkpNuDqjDNiGLKX';
    const validMint = 'ApBLMhq4gUaQ5ANaqK7ofqiTJm5YxFa5pT2CQut2bonk';
    return {
      address: validAddress,
      mint: validMint,
      source: 'stub',
      ...log.mockPoolData,
      estimatedSlippage: log.mockPoolData.estimatedSlippage || 0,
      creator: log.mockPoolData.creator || 'MockCreator'
    };
  }

  if (!log.signature) return null;

  const tx = await httpConnection.getParsedTransaction(log.signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });

  if (!tx) {
    return null;
  }

  const isNewPumpV1Pool = (tx.meta?.preTokenBalances?.length ?? -1) === 0;

  if (isNewPumpV1Pool) {
    console.log(`[SUCCESS] Ny Pump.fun V1-pool identifierad! Signature: ${log.signature}`);

    const wsolMint = 'So11111111111111111111111111111111111111112';
    const postTokenBalances = tx.meta?.postTokenBalances ?? [];
    const newPoolMint = postTokenBalances.find(balance => balance.mint !== wsolMint);

    if (newPoolMint) {
      return {
        address: log.signature,
        mint: newPoolMint.mint,
        source: 'PumpV1',
        mintAuthority: null, // Pump.fun revokes authorities
        freezeAuthority: null, // Pump.fun revokes authorities
        lpSol: 0, // Pump.fun uses a bonding curve, not a traditional LP. Value is not directly available.
        creatorFee: 0, // Not directly available, assuming 0 for now
        estimatedSlippage: 0, // Not applicable in the same way
      };
    }
  }

  return null;
}

if (require.main === module) {
  listenForNewPools();
}

export { listenForNewPools, PoolData };

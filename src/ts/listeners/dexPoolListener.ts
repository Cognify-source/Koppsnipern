import { Connection, PublicKey, Logs, clusterApiUrl } from '@solana/web3.js';
import { PoolData } from '../services/safetyService'; // Import from authoritative source
import dotenv from 'dotenv';
import * as mockPoolEvents from '../../../tests/integration/data/mock-pool-events.json';

dotenv.config({ override: true, debug: false });

// Callback type for notifying the orchestrator of a new pool
export type NewPoolCallback = (poolData: PoolData) => void;

export class DexPoolListener {
  private _httpConnection: Connection;
  private _wsConnection: Connection | null = null;
  private _onNewPool: NewPoolCallback;
  private _useStubListener: boolean;

  constructor(callback: NewPoolCallback) {
    this._onNewPool = callback;
    this._useStubListener = process.env.USE_STUB_LISTENER === 'true';

    const httpRpcUrl =
      process.env.SOLANA_HTTP_RPC_URL?.startsWith('http')
        ? process.env.SOLANA_HTTP_RPC_URL
        : clusterApiUrl('mainnet-beta');
    this._httpConnection = new Connection(httpRpcUrl, 'confirmed');

    const wssRpcUrl = process.env.SOLANA_WSS_RPC_URL?.startsWith('ws')
      ? process.env.SOLANA_WSS_RPC_URL
      : undefined;

    if (!wssRpcUrl && !this._useStubListener) {
      throw new Error('SOLANA_WSS_RPC_URL must be set in .env for live mode.');
    }

    if (wssRpcUrl) {
      this._wsConnection = new Connection(httpRpcUrl, {
        commitment: 'confirmed',
        wsEndpoint: wssRpcUrl,
      } as any);
    }
  }

  public async start() {
    console.log(`🚀 Starting pool listener... ${this._useStubListener ? '[STUB MODE]' : '[LIVE MODE]'}`);

    if (this._useStubListener) {
      this._startStubListener();
    } else {
      this._startLiveListener();
    }
  }

  private _startStubListener() {
    console.log('[STUB] Reading mock pool events from file...');
    let eventIndex = 0;
    setInterval(() => {
      if (eventIndex >= mockPoolEvents.length) {
        console.log('[STUB] All mock events processed. Resetting.');
        eventIndex = 0;
      }
      const mockLog = mockPoolEvents[eventIndex];
      console.log(`[STUB] Processing mock event #${eventIndex + 1}: ${mockLog.signature}`);
      this._processLog(mockLog);
      eventIndex++;
    }, 5000);
  }

  private _startLiveListener() {
    if (!this._wsConnection) {
      throw new Error('WebSocket connection is not available for live mode.');
    }
    const pumpV1ProgramId = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
    console.log(`[LIVE] Listening for logs from Pump.fun V1 program: ${pumpV1ProgramId.toBase58()}`);
    this._wsConnection.onLogs(pumpV1ProgramId, log => this._processLog(log));
  }

  private async _processLog(log: Logs | any) {
    const poolData = await this._extractPoolDataFromLog(log);
    if (poolData) {
      console.log(`[LISTENER] New potential pool found: ${poolData.address}. Passing to orchestrator.`);
      this._onNewPool(poolData);
    }
  }

  private async _extractPoolDataFromLog(log: any): Promise<PoolData | null> {
    if (this._useStubListener) {
      console.log(`[STUB_EXTRACT] Creating mock pool data for ${log.signature}`);
      if (log.signature === 'MOCK_PUMPV1_POOL_SUCCESS') {
        // This pool is designed to PASS the safety checks
        return {
          address: 'So11111111111111111111111111111111111111112', // Valid public key
          mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Valid public key
          source: 'stub-safe',
          mintAuthority: null,
          freezeAuthority: null,
          lpSol: 25, // check: > 10 SOL
          creatorFee: 3, // check: < 5 %
          estimatedSlippage: 1, // check: < 3 %
          creator: 'SafeCreator',
        };
      } else {
        // This pool is designed to FAIL the safety checks
        return {
          address: '11111111111111111111111111111111', // Valid public key
          mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Valid public key
          source: 'stub-blocked',
          mintAuthority: 'SOME_AUTHORITY_KEY', // This will cause the check to fail
          freezeAuthority: null,
          lpSol: 50,
          creatorFee: 2,
          estimatedSlippage: 1,
          creator: 'BlockedCreator',
        };
      }
    }

    // Live logic (unchanged from original)
    if (!log.signature) return null;

    try {
      const tx = await this._httpConnection.getParsedTransaction(log.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) return null;

      const isNewPumpV1Pool = (tx.meta?.preTokenBalances?.length ?? -1) === 0;

      if (isNewPumpV1Pool) {
        console.log(`[EXTRACT] Identified new Pump.fun V1 pool. Signature: ${log.signature}`);

        const wsolMint = 'So11111111111111111111111111111111111111112';
        const postTokenBalances = tx.meta?.postTokenBalances ?? [];
        const newPoolMint = postTokenBalances.find(balance => balance.mint !== wsolMint);

        if (newPoolMint) {
          return {
            address: log.signature,
            mint: newPoolMint.mint,
            source: 'PumpV1',
            mintAuthority: null,
            freezeAuthority: null,
            lpSol: 0,
            creatorFee: 0,
            estimatedSlippage: 0,
          };
        }
      }
    } catch (error) {
      console.error(`[EXTRACT] Error processing transaction ${log.signature}:`, error);
    }

    return null;
  }
}

export { PoolData };

import { Connection, PublicKey, Logs, clusterApiUrl } from '@solana/web3.js';
import { PoolData } from '../../services/safetyService';
import { IPoolListener, NewPoolCallback } from '../iPoolListener';
import * as mockPoolEvents from '../../../../tests/integration/data/mock-pool-events.json';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export class PumpV1Listener implements IPoolListener {
  private _httpConnection: Connection;
  private _wsConnection: Connection | null = null;
  private _onNewPool: NewPoolCallback;

  constructor(callback: NewPoolCallback) {
    this._onNewPool = callback;

    const httpRpcUrl =
      process.env.SOLANA_HTTP_RPC_URL?.startsWith('http')
        ? process.env.SOLANA_HTTP_RPC_URL
        : clusterApiUrl('mainnet-beta');
    this._httpConnection = new Connection(httpRpcUrl, 'confirmed');

    const wssRpcUrl = process.env.SOLANA_WSS_RPC_URL?.startsWith('ws')
      ? process.env.SOLANA_WSS_RPC_URL
      : undefined;

    if (!wssRpcUrl) {
      throw new Error('SOLANA_WSS_RPC_URL must be set in .env for live mode.');
    }
    this._wsConnection = new Connection(httpRpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: wssRpcUrl,
    } as any);
  }

  public start() {
    console.log(`[PUMP_V1] Starting listener... (live-mode only)`);
    this._startLiveListener();
  }

  /*
  private _startStubListener() {
    console.log('[PUMP_V1_STUB] Reading mock pool events from file...');
    let eventIndex = 0;
    setInterval(() => {
      if (eventIndex >= mockPoolEvents.length) {
        console.log('[PUMP_V1_STUB] All mock events processed. Resetting.');
        eventIndex = 0;
      }
      const mockLog = mockPoolEvents[eventIndex];
      console.log(`[PUMP_V1_STUB] Processing mock event #${eventIndex + 1}: ${mockLog.signature}`);
      this._processLog(mockLog);
      eventIndex++;
    }, 5000);
  }
  */

  private _startLiveListener() {
    if (!this._wsConnection) {
      throw new Error('WebSocket connection is not available for live mode.');
    }
    const pumpV1ProgramId = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
    console.log(`[PUMP_V1_LIVE] Listening for logs from Pump.fun V1 program: ${pumpV1ProgramId.toBase58()}`);
    this._wsConnection.onLogs(pumpV1ProgramId, log => this._processLog(log));
  }

  private async _processLog(log: Logs | any) {
    const poolData = await this._extractPoolDataFromLog(log);
    if (poolData) {
      console.log(`[PUMP_V1_LISTENER] New potential pool found: ${poolData.address}. Passing to orchestrator.`);
      this._onNewPool(poolData);
    }
  }

  private async _extractPoolDataFromLog(log: any): Promise<PoolData | null> {
    // Live logic only
    if (!log.signature) return null;

    try {
      const tx = await this._httpConnection.getParsedTransaction(log.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx || !tx.meta) return null;

      const isNewPumpV1Pool = (tx.meta.preTokenBalances?.length ?? -1) === 0;
      const isPumpV1Program = tx.transaction.message.instructions.some(ix => ix.programId.toBase58() === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

      if (isNewPumpV1Pool && isPumpV1Program) {
        console.log(`[EXTRACT] Identified new Pump.fun V1 pool. Signature: ${log.signature}`);

        const accountKeys = tx.transaction.message.accountKeys;
        const bondingCurveAddress = accountKeys[2].pubkey.toBase58();
        const tokenMintAddress = accountKeys[1].pubkey.toBase58();

        let mintAuthorityRevoked = false;
        tx.meta.innerInstructions?.forEach(ix => {
          ix.instructions.forEach(iix => {
            if ('parsed' in iix && iix.program === 'spl-token' && iix.parsed.type === 'setAuthority') {
              const parsedIx = iix.parsed.info;
              if (parsedIx.authorityType === 'mintTokens' && parsedIx.newAuthority === null) {
                mintAuthorityRevoked = true;
              }
            }
          });
        });

        let maxLpSol = 0;
        tx.meta.innerInstructions?.forEach(ix => {
          ix.instructions.forEach(iix => {
            if ('parsed' in iix && iix.program === 'system' && iix.parsed.type === 'transfer') {
              const parsedIx = iix.parsed.info;
              if (parsedIx.destination === bondingCurveAddress) {
                if (parsedIx.lamports > maxLpSol) {
                  maxLpSol = parsedIx.lamports;
                }
              }
            }
          });
        });
        const initialLpSol = maxLpSol;

        return {
          address: bondingCurveAddress,
          mint: tokenMintAddress,
          source: 'PumpV1',
          mintAuthority: mintAuthorityRevoked ? null : 'UNKNOWN',
          freezeAuthority: null,
          lpSol: initialLpSol / 1e9,
          creatorFee: 0,
          estimatedSlippage: 0,
          creator: tx.transaction.message.accountKeys[0].pubkey.toBase58(),
        };
      }
    } catch (error) {
      console.error(`[EXTRACT] Error processing transaction ${log.signature}:`, error);
    }

    return null;
  }
}

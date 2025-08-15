import { Connection, PublicKey, Logs, clusterApiUrl, ParsedTransactionWithMeta } from '@solana/web3.js';
import { PoolData } from '../../services/safetyService';
import { IPoolListener, NewPoolCallback } from '../iPoolListener';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export class PumpV1Listener implements IPoolListener {
  private _httpConnection: Connection;
  private _wsConnection: Connection | null = null;
  private _onNewPool: NewPoolCallback;
  private _signatureQueue: string[] = [];

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

  public async start() {
    console.log(`[PUMP_V1] Starting listener... (live-mode only)`);
    this._startLiveListener();
    setInterval(() => this._processSignatureQueue(), 200);
  }

  private _startLiveListener() {
    if (!this._wsConnection) {
      throw new Error('WebSocket connection is not available for live mode.');
    }
    const pumpV1ProgramId = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
    console.log(`[PUMP_V1_LIVE] Listening for logs from Pump.fun V1 program: ${pumpV1ProgramId.toBase58()}`);
    this._wsConnection.onLogs(pumpV1ProgramId, (log) => {
      if (!log.err) {
        this._signatureQueue.push(log.signature);
      }
    });
  }

  private async _processSignatureQueue() {
    if (this._signatureQueue.length === 0) {
      return;
    }

    const signatures = this._signatureQueue.splice(0, this._signatureQueue.length);

    try {
      const txs = await this._httpConnection.getParsedTransactions(signatures, {
        maxSupportedTransactionVersion: 0,
      });

      for (const tx of txs) {
        if (tx) {
          const poolData = await this._extractPoolDataFromLog(tx);
          if (poolData) {
            console.log(`[PUMP_V1_LISTENER] New potential pool found: ${poolData.address}. Passing to orchestrator.`);
            this._onNewPool(poolData);
          }
        }
      }
    } catch (error) {
      console.error('[QUEUE] Error fetching or processing transactions in batch:', error);
    }
  }

  private async _extractPoolDataFromLog(tx: ParsedTransactionWithMeta): Promise<PoolData | null> {
    const signature = tx.transaction.signatures[0];
    if (!signature) return null;

    try {
      if (!tx.meta) return null;

      const isNewPumpV1Pool = (tx.meta.preTokenBalances?.length ?? -1) === 0;
      const isPumpV1Program = tx.transaction.message.instructions.some((ix: any) => ix.programId.toBase58() === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

      if (isNewPumpV1Pool && isPumpV1Program) {
        const accountKeys = tx.transaction.message.accountKeys;
        const bondingCurveAddress = accountKeys[2].pubkey.toBase58();
        const tokenMintAddress = accountKeys[1].pubkey.toBase58();

        let mintAuthorityRevoked = false;
        tx.meta.innerInstructions?.forEach((ix: any) => {
          ix.instructions.forEach((iix: any) => {
            if (iix.parsed && iix.program === 'spl-token' && iix.parsed.type === 'setAuthority') {
              const parsedIx = iix.parsed.info;
              if (parsedIx.authorityType === 'mintTokens' && parsedIx.newAuthority === null) {
                mintAuthorityRevoked = true;
              }
            }
          });
        });

        let maxLpSol = 0;
        tx.meta.innerInstructions?.forEach((ix: any) => {
          ix.instructions.forEach((iix: any) => {
            if (iix.parsed && iix.program === 'system' && iix.parsed.type === 'transfer') {
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
          creatorFee: 0, // Reverted to 0 as we are pausing this feature
          estimatedSlippage: 0,
          creator: tx.transaction.message.accountKeys[0].pubkey.toBase58(),
        };
      }
    } catch (error) {
      console.error(`[EXTRACT] Error processing transaction ${signature}:`, error);
    }

    return null;
  }
}

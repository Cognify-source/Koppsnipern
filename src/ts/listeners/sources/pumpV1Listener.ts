import { Connection, PublicKey, Logs, clusterApiUrl, ParsedTransactionWithMeta } from '@solana/web3.js';
import { PoolData } from '../../services/safetyService';
import { IPoolListener, NewPoolCallback } from '../iPoolListener';
import { ConnectionManager } from '../../utils/connectionManager';
import * as dotenv from 'dotenv';

dotenv.config();

export class PumpV1Listener implements IPoolListener {
  private _httpConnection: Connection;
  private _wsConnection: Connection;
  private _onNewPool: NewPoolCallback;
  private _signatureQueue: string[] = [];

  constructor(callback: NewPoolCallback) {
    this._onNewPool = callback;
    
    // Use shared connections to reduce RPC overhead
    this._httpConnection = ConnectionManager.getHttpConnection();
    this._wsConnection = ConnectionManager.getWsConnection();
  }

  public async start() {
    console.log(`[PUMP_V1] Starting listener... (live-mode only)`);
    this._startLiveListener();
    console.log(`[PUMP_V1] Using global RPC queue - no individual timer needed`);
    // No individual timer - process signatures immediately via global queue
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
        // Don't process immediately - let timer handle batching to prevent queue overflow
      }
    });
    
    // Process queue every 200ms to balance speed vs queue growth
    // This prevents WebSocket bursts from overwhelming the RPC queue
    setInterval(() => {
      this._processSignatureQueue();
    }, 200);
  }

  private async _processSignatureQueue() {
    if (this._signatureQueue.length === 0) {
      return;
    }

    const queueSizeBefore = this._signatureQueue.length;
    console.log(`[PUMP_V1_QUEUE] Processing ${queueSizeBefore} signatures in queue`);
    
    // Limit batch size to reduce RPC load and avoid rate limits
    const maxBatchSize = 10;
    const signatures = this._signatureQueue.splice(0, Math.min(maxBatchSize, this._signatureQueue.length));

    try {
      const txs = await ConnectionManager.getParsedTransactions(
        signatures,
        { maxSupportedTransactionVersion: 0 },
        'PumpV1Listener'
      );

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
        
        // Find the actual bonding curve and mint addresses by looking for the right patterns
        // Skip system programs and look for actual accounts
        let bondingCurveAddress = '';
        let tokenMintAddress = '';
        
        for (let i = 0; i < accountKeys.length; i++) {
          const address = accountKeys[i].pubkey.toBase58();
          // Skip known system programs
          if (address === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P' || // Pump program
              address === 'ComputeBudget111111111111111111111111111111' || // ComputeBudget
              address === '11111111111111111111111111111111' || // System program
              address === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' || // Token program
              address === 'SysvarRent111111111111111111111111111111111' || // Rent sysvar
              address.startsWith('So1111111111111111111111111111111111111111')) { // WSOL
            continue;
          }
          
          // The first non-system account should be the bonding curve
          if (!bondingCurveAddress) {
            bondingCurveAddress = address;
          } else if (!tokenMintAddress) {
            tokenMintAddress = address;
            break;
          }
        }
        
        if (!bondingCurveAddress || !tokenMintAddress) {
          return null;
        }

        let mintAuthorityRevoked = false;
        let freezeAuthorityRevoked = false;
        tx.meta.innerInstructions?.forEach((ix: any) => {
          ix.instructions.forEach((iix: any) => {
            if (iix.parsed && iix.program === 'spl-token' && iix.parsed.type === 'setAuthority') {
              const parsedIx = iix.parsed.info;
              if (parsedIx.authorityType === 'mintTokens' && parsedIx.newAuthority === null) {
                mintAuthorityRevoked = true;
              }
              if (parsedIx.authorityType === 'freezeAccount' && parsedIx.newAuthority === null) {
                freezeAuthorityRevoked = true;
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
          freezeAuthority: freezeAuthorityRevoked ? null : 'UNKNOWN',
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

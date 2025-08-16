import { Connection, PublicKey, Logs, clusterApiUrl } from '@solana/web3.js';
import { PoolData, SafetyService } from '../../services/safetyService';
import { IPoolListener, NewPoolCallback } from '../iPoolListener';
import { ConnectionManager } from '../../utils/connectionManager';
import { logSafePool, logBlockedPool } from '../../services/notifyService';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export class MeteoraDbcListener implements IPoolListener {
  private _httpConnection: Connection;
  private _wsConnection: Connection;
  private _onNewPool: NewPoolCallback;
  private _programId: PublicKey;
  private _signatureQueue: string[] = [];
  private _safetyService: SafetyService;

  constructor(callback: NewPoolCallback) {
    this._onNewPool = callback;
    this._safetyService = new SafetyService();
    this._programId = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');
    
    // Use shared connections to reduce RPC overhead
    this._httpConnection = ConnectionManager.getHttpConnection();
    this._wsConnection = ConnectionManager.getWsConnection();
  }

  public async start() {
    this._startLiveListener();
  }

  private _startLiveListener() {
    if (!this._wsConnection) {
      throw new Error('WebSocket connection is not available for live mode.');
    }
    this._wsConnection.onLogs(this._programId, (log) => {
      if (!log.err) {
        this._signatureQueue.push(log.signature);
      }
    });
    
    // Staggered execution: MeteoraDBC starts with 150ms offset
    // Conservative 80ms intervals - lower volume source, sustainable rate
        setTimeout(() => {
            setInterval(() => {
                this._processSignatureQueue();
            }, 720);
        }, 240);
  }

  private async _processSignatureQueue() {
    if (this._signatureQueue.length === 0) {
      return;
    }

    // No batching - process one transaction at a time to avoid Chainstack rate limits
    const maxBatchSize = 1;
    const signatures = this._signatureQueue.splice(0, Math.min(maxBatchSize, this._signatureQueue.length));

    try {
      const txs = await ConnectionManager.getParsedTransactions(
        signatures,
        { maxSupportedTransactionVersion: 0 },
        'MeteoraDbcListener'
      );

      for (const tx of txs) {
        if (tx) {
          const poolData = await this._extractPoolDataFromTransaction(tx);
          if (poolData) {
            // Run safety check and get result
            const safetyResult = await this._safetyService.isPoolSafe(poolData);
            
            const now = new Date();
            const timestamp = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
            const mintAuth = poolData.mintAuthority ? '\x1b[31mMINT\x1b[0m' : '\x1b[32mNO_MINT\x1b[0m';
            const freezeAuth = poolData.freezeAuthority ? '\x1b[31mFREEZE\x1b[0m' : '\x1b[32mNO_FREEZE\x1b[0m';
            
            // Color code safety status and add reasons if blocked
            let safetyStatus = safetyResult.status === 'SAFE' 
              ? '\x1b[32mSAFE\x1b[0m' 
              : '\x1b[31mBLOCKED\x1b[0m';
            
            // Add blocking reasons if pool is blocked
            if (safetyResult.status === 'BLOCKED' && safetyResult.reasons.length > 0) {
              const reasons = safetyResult.reasons.join(', ');
              safetyStatus += ` (${reasons})`;
            }
            
            console.log(`[${timestamp}] MeteoraDBC | \x1b[32mCA:${poolData.address}\x1b[0m | LP:${poolData.lpSol} | ${mintAuth} | ${freezeAuth} | ${safetyStatus}`);
            
            // Log to files
            if (safetyResult.status === 'SAFE') {
              await logSafePool(safetyResult);
              this._onNewPool(poolData);
            } else {
              await logBlockedPool(safetyResult, poolData);
            }
          }
        }
      }
    } catch (error) {
      // Silent error handling - only global RPS logging allowed
    }
  }

  private async _extractPoolDataFromTransaction(tx: any): Promise<PoolData | null> {
    const signature = tx.transaction.signatures[0];
    if (!signature) return null;

    try {
      if (!tx.meta) return null;

      // Check for the specific instruction log
      const instructionSignature = 'Instruction: InitializeVirtualPoolWithSplToken';
      const hasInstruction = tx.meta.logMessages?.some((l: string) => l.includes(instructionSignature));

      if (hasInstruction) {
        const createInstruction = tx.transaction.message.instructions.find(
          (ix: any) => ix.programId.toBase58() === this._programId.toBase58()
        );

        if (!createInstruction || !('accounts' in createInstruction)) {
          return null;
        }

        // From the user's IDL: #2=creator, #3=base_mint, #5=pool
        const creatorAccount = createInstruction.accounts[2];
        const baseMintAccount = createInstruction.accounts[3];
        const poolStateAccount = createInstruction.accounts[5];

        if (!poolStateAccount || !baseMintAccount || !creatorAccount) {
          return null;
        }

        const poolData: PoolData = {
          address: poolStateAccount.toBase58(),
          mint: baseMintAccount.toBase58(),
          creator: creatorAccount.toBase58(),
          source: 'MeteoraDBC',
          // These fields are not available from this event/tx structure
          lpSol: 0,
          mintAuthority: null,
          freezeAuthority: null,
          creatorFee: 0,
          estimatedSlippage: 0,
        };

        return poolData;
      }
    } catch (error) {
      console.error(`[METEORA_DBC_EXTRACT] Error processing transaction ${signature}:`, error);
    }

    return null;
  }
}

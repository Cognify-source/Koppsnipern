import { Connection, PublicKey, Logs, clusterApiUrl } from '@solana/web3.js';
import { PoolData } from '../../services/safetyService';
import { IPoolListener, NewPoolCallback } from '../iPoolListener';
import { ConnectionManager } from '../../utils/connectionManager';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export class MeteoraDbcListener implements IPoolListener {
  private _httpConnection: Connection;
  private _wsConnection: Connection;
  private _onNewPool: NewPoolCallback;
  private _programId: PublicKey;
  private _signatureQueue: string[] = [];

  constructor(callback: NewPoolCallback) {
    this._onNewPool = callback;
    this._programId = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');
    
    // Use shared connections to reduce RPC overhead
    this._httpConnection = ConnectionManager.getHttpConnection();
    this._wsConnection = ConnectionManager.getWsConnection();
  }

  public async start() {
    console.log(`[METEORA_DBC] Starting listener... (live-mode only)`);
    this._startLiveListener();
    console.log(`[METEORA_DBC] Using global RPC queue for rate limiting`);
    // Process queue every 500ms, but actual RPC calls go through global queue
    setInterval(() => this._processSignatureQueue(), 500);
  }

  private _startLiveListener() {
    if (!this._wsConnection) {
      throw new Error('WebSocket connection is not available for live mode.');
    }
    console.log(`[METEORA_DBC_LIVE] Listening for logs from MeteoraDBC program: ${this._programId.toBase58()}`);
    this._wsConnection.onLogs(this._programId, (log) => {
      if (!log.err) {
        this._signatureQueue.push(log.signature);
      }
    });
  }

  private async _processSignatureQueue() {
    if (this._signatureQueue.length === 0) {
      return;
    }

    // Limit batch size to reduce RPC load and avoid rate limits
    const maxBatchSize = 10;
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
            console.log(`[METEORA_DBC_LISTENER] New potential pool found: ${poolData.address}. Passing to orchestrator.`);
            this._onNewPool(poolData);
          }
        }
      }
    } catch (error) {
      console.error('[METEORA_DBC_QUEUE] Error fetching or processing transactions in batch:', error);
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

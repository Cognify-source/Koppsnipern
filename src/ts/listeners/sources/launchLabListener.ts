import { Connection, PublicKey, Logs, clusterApiUrl, ParsedInstruction } from '@solana/web3.js';
import { PoolData } from '../../services/safetyService';
import { IPoolListener, NewPoolCallback } from '../iPoolListener';
import { ConnectionManager } from '../../utils/connectionManager';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export class LaunchLabListener implements IPoolListener {
  private _httpConnection: Connection;
  private _wsConnection: Connection;
  private _onNewPool: NewPoolCallback;
  private _programId: PublicKey;
  private _signatureQueue: string[] = [];

  constructor(callback: NewPoolCallback) {
    this._onNewPool = callback;
    this._programId = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');
    
    // Use shared connections to reduce RPC overhead
    this._httpConnection = ConnectionManager.getHttpConnection();
    this._wsConnection = ConnectionManager.getWsConnection();
  }

  public async start() {
    console.log(`[LAUNCHLAB] Starting listener... (live-mode only)`);
    this._startLiveListener();
    console.log(`[LAUNCHLAB] Using global RPC queue for rate limiting`);
    // Process queue every 500ms, but actual RPC calls go through global queue
    setInterval(() => this._processSignatureQueue(), 500);
  }

  private _startLiveListener() {
    if (!this._wsConnection) {
      throw new Error('WebSocket connection is not available for live mode.');
    }
    console.log(`[LAUNCHLAB_LIVE] Listening for logs from LaunchLab program: ${this._programId.toBase58()}`);
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
        'LaunchLabListener'
      );

      for (const tx of txs) {
        if (tx) {
          const poolData = await this._extractPoolDataFromTransaction(tx);
          if (poolData) {
            console.log(`[LAUNCHLAB_LISTENER] New potential pool found: ${poolData.address}. Passing to orchestrator.`);
            this._onNewPool(poolData);
          }
        }
      }
    } catch (error) {
      console.error('[LAUNCHLAB_QUEUE] Error fetching or processing transactions in batch:', error);
    }
  }

  private async _extractPoolDataFromTransaction(tx: any): Promise<PoolData | null> {
    const signature = tx.transaction.signatures[0];
    if (!signature) return null;

    try {
      if (!tx.meta) return null;

      // Check for the specific event string in the logs
      const eventSignature = 'Program log: Instruction: CreatePool';
      const hasEvent = tx.meta.logMessages?.some((l: string) => l.includes(eventSignature));

      if (hasEvent) {
        // Find the instruction sent to our program
        const createInstruction = tx.transaction.message.instructions.find(
          (ix: any) => ix.programId.toBase58() === this._programId.toBase58()
        );

        if (!createInstruction || !('accounts' in createInstruction)) {
          return null;
        }

        // From the user's data: #6 is Pool State, #7 is Base Mint
        const poolStateAccount = createInstruction.accounts[5];
        const baseMintAccount = createInstruction.accounts[6];
        const creatorAccount = createInstruction.accounts[1];

        if (!poolStateAccount || !baseMintAccount || !creatorAccount) {
          return null;
        }

        const poolData: PoolData = {
          address: poolStateAccount.toBase58(),
          mint: baseMintAccount.toBase58(),
          creator: creatorAccount.toBase58(),
          source: 'LaunchLab',
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
      console.error(`[LAUNCHLAB_EXTRACT] Error processing transaction ${signature}:`, error);
    }

    return null;
  }
}

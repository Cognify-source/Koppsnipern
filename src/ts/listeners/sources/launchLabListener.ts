import { Connection, PublicKey, Logs, clusterApiUrl, ParsedInstruction } from '@solana/web3.js';
import { PoolData, SafetyService } from '../../services/safetyService';
import { IPoolListener, NewPoolCallback } from '../iPoolListener';
import { ConnectionManager } from '../../utils/connectionManager';
import { logSafePool, logBlockedPool } from '../../services/notifyService';
import { delayedLpChecker } from '../../services/delayedLpChecker';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export class LaunchLabListener implements IPoolListener {
  private _httpConnection: Connection;
  private _wsConnection: Connection;
  private _onNewPool: NewPoolCallback;
  private _programId: PublicKey;
  private _signatureQueue: string[] = [];
  private _safetyService: SafetyService;

  constructor(callback: NewPoolCallback) {
    this._onNewPool = callback;
    this._safetyService = new SafetyService();
    this._programId = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');
    
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
    
    // Staggered execution: LaunchLab starts with 100ms offset
    // Conservative 80ms intervals - lower volume source, sustainable rate
        setTimeout(() => {
            setInterval(() => {
                this._processSignatureQueue();
            }, 680);
        }, 160);
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
        'LaunchLabListener'
      );

      for (const tx of txs) {
        if (tx) {
          const poolData = await this._extractPoolDataFromTransaction(tx);
          if (poolData) {
            // Check if this pool has very low LP and should be scheduled for delayed checking
            if (poolData.lpSol < 0.1) {
              // Run safety check immediately in parallel while monitoring LP
              this._processParallelSafetyAndLpCheck(poolData);
            } else {
              // Pool has sufficient LP, process immediately
              await this._processSafetyCheck(poolData);
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

  /**
   * Process safety check and LP monitoring in parallel for low-LP pools
   */
  private async _processParallelSafetyAndLpCheck(poolData: PoolData): Promise<void> {
    let safetyResult: any = null;
    let isPoolSafe = false;
    let lpFound = false;
    let finalPoolData = poolData;
    let processed = false; // Prevent double processing
    let lpFoundTime = 0; // Track timing
    const startTime = Date.now();

    try {
      // Start safety check immediately (don't await yet)
      const safetyCheckPromise = this._safetyService.isPoolSafe(poolData);
      
      // Schedule LP monitoring with callback
      delayedLpChecker.scheduleCheck(poolData, async (updatedPoolData) => {
        if (processed) return; // Prevent double processing
        
        lpFound = true;
        finalPoolData = updatedPoolData;
        lpFoundTime = Date.now() - startTime; // Calculate timing
        
        // If safety check is already done, process with updated LP data
        if (safetyResult) {
          processed = true;
          // Process with updated LP data (this will run a fresh safety check)
          await this._processSafetyCheck(updatedPoolData, true, lpFoundTime);
        }
      });
      
      // Wait for safety check to complete
      safetyResult = await safetyCheckPromise;
      isPoolSafe = safetyResult.status === 'SAFE';
      
      // Always wait for LP result for low LP pools, regardless of safety status
      // If LP was already found while we were doing safety check, process immediately
      if (lpFound && !processed) {
        processed = true;
        await this._processSafetyCheck(finalPoolData, true, lpFoundTime);
      }
      // Otherwise, the LP callback will handle processing when LP is found (or timeout)
      
    } catch (error) {
      console.error(`[LaunchLab] Error in parallel processing for pool ${poolData.address}:`, error);
    }
  }

  /**
   * Process safety check and handle logging/callbacks
   */
  private async _processSafetyCheck(poolData: PoolData, wasDelayedLpCheck: boolean = false, lpFoundTimeMs: number = 0): Promise<void> {
    try {
      // Run safety check and get result
      const safetyResult = await this._safetyService.isPoolSafe(poolData);
      
      const now = new Date();
      const timestamp = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      
      // Color code safety status and add reasons if blocked
      let safetyStatus = safetyResult.status === 'SAFE' 
        ? '\x1b[32mSAFE\x1b[0m' 
        : '\x1b[31mBLOCKED\x1b[0m';
      
      // Add blocking reasons if pool is blocked
      if (safetyResult.status === 'BLOCKED' && safetyResult.reasons.length > 0) {
        const reasons = safetyResult.reasons.join(', ');
        safetyStatus += ` (${reasons})`;
      }
      
      // Format with proper column alignment
      const source = 'LaunchLab'.padEnd(12);
      const address = poolData.address.padEnd(44);
      const lp = `LP:${poolData.lpSol.toFixed(3)}`.padEnd(12);
      const mintAuth = (poolData.mintAuthority ? '\x1b[31mMINT\x1b[0m' : '\x1b[32mNO_MINT\x1b[0m').padEnd(17); // 17 to account for ANSI codes
      const freezeAuth = (poolData.freezeAuthority ? '\x1b[31mFREEZE\x1b[0m' : '\x1b[32mNO_FREEZE\x1b[0m').padEnd(19); // 19 to account for ANSI codes
      
      // Add timing info for delayed LP checks
      let delayedIndicator = wasDelayedLpCheck ? '\x1b[33mDELAYED_LP\x1b[0m' : 'IMMEDIATE';
      if (wasDelayedLpCheck && lpFoundTimeMs > 0) {
        delayedIndicator += ` \x1b[36m(${lpFoundTimeMs}ms)\x1b[0m`;
      }
      
      console.log(`[${timestamp}] ${source} | \x1b[32m${address}\x1b[0m | ${lp} | ${mintAuth} | ${freezeAuth} | ${safetyStatus} | ${delayedIndicator}`);
      
      // Log to files
      if (safetyResult.status === 'SAFE') {
        await logSafePool(safetyResult);
        this._onNewPool(poolData);
      } else {
        await logBlockedPool(safetyResult, poolData);
      }
    } catch (error) {
      console.error(`[LaunchLab] Error processing safety check for pool ${poolData.address}:`, error);
    }
  }
}

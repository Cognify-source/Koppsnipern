import { Connection, PublicKey, Logs, clusterApiUrl, ParsedTransactionWithMeta } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { PoolData, SafetyService } from '../../services/safetyService';
import { IPoolListener, NewPoolCallback } from '../iPoolListener';
import { ConnectionManager } from '../../utils/connectionManager';
import { logSafePool, logBlockedPool } from '../../services/notifyService';
import { delayedLpChecker } from '../../services/delayedLpChecker';
import * as mockPoolEvents from '../../../../tests/integration/data/mock-pump-amm-events.json';
import * as dotenv from 'dotenv';

dotenv.config();

export class PumpAmmListener implements IPoolListener {
  private _httpConnection: Connection;
  private _wsConnection: Connection;
  private _onNewPool: NewPoolCallback;
  private _programId: PublicKey;
  private _signatureQueue: string[] = [];
  private _safetyService: SafetyService;

  constructor(callback: NewPoolCallback) {
    this._onNewPool = callback;
    this._safetyService = new SafetyService();
    this._programId = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
    
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
    
    // Staggered execution: PumpAMM starts with 50ms offset
    // Better separation to reduce RPC burst conflicts
        setTimeout(() => {
            setInterval(() => {
                this._processSignatureQueue();
            }, 640);
        }, 80);
  }

  private async _processSignatureQueue() {
    if (this._signatureQueue.length === 0) {
      return;
    }

    // Process one transaction at a time for maximum Chainstack compatibility
    const maxBatchSize = 1;
    const signatures = this._signatureQueue.splice(0, Math.min(maxBatchSize, this._signatureQueue.length));

    try {
      const txs = await ConnectionManager.getParsedTransactions(
        signatures,
        { maxSupportedTransactionVersion: 0 },
        'PumpAmmListener'
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

  private async _extractPoolDataFromTransaction(tx: ParsedTransactionWithMeta): Promise<PoolData | null> {
    const signature = tx.transaction.signatures[0];
    if (!signature) return null;

    try {
      if (!tx.meta || !tx.meta.logMessages) return null;

      // Look for PumpAMM CreatePool event in logs
      const eventPrefix = 'Program data: ';
      const eventLog = tx.meta.logMessages.find(l => l.startsWith(eventPrefix));

      if (eventLog) {
        const base64Data = eventLog.substring(eventPrefix.length);
        const dataBuffer = Buffer.from(base64Data, 'base64');

        // First 8 bytes are the event discriminator, skip them
        const eventDataBuffer = dataBuffer.slice(8);

        const poolData = this._parseCreatePoolEvent(eventDataBuffer);
        if (poolData) {
          // Additional validation for PumpAMM pools
          const isPumpAmmProgram = tx.transaction.message.instructions.some((ix: any) => 
            ix.programId.toBase58() === this._programId.toBase58()
          );

          if (isPumpAmmProgram) {
            return poolData;
          }
        }
      }
    } catch (error) {
      console.error(`[PUMP_AMM_EXTRACT] Error processing transaction ${signature}:`, error);
    }

    return null;
  }

  private _startStubListener(): void {
    console.log('[PUMP_AMM_STUB] Starting stub listener...');
    let eventIndex = 0;
    setInterval(() => {
      if (eventIndex >= mockPoolEvents.length) {
        console.log('[PUMP_AMM_STUB] All mock events processed. Resetting.');
        eventIndex = 0;
      }
      const mockLog = mockPoolEvents[eventIndex];
      this._processLog(mockLog as Logs);
      eventIndex++;
    }, 5000);
  }

  private _parseCreatePoolEvent(dataBuffer: Buffer): PoolData | null {
    try {
      let offset = 0;

      // Skip timestamp and index for now as they aren't used in PoolData
      offset += 8; // i64
      offset += 2; // u16

      const creator = new PublicKey(dataBuffer.slice(offset, offset + 32));
      offset += 32;
      const baseMint = new PublicKey(dataBuffer.slice(offset, offset + 32));
      offset += 32;
      const quoteMint = new PublicKey(dataBuffer.slice(offset, offset + 32));
      offset += 32;

      // Check if the pool is a SOL pair
      const wsolMint = 'So11111111111111111111111111111111111111112';
      if (quoteMint.toBase58() !== wsolMint) {
        return null;
      }

      offset += 1; // base_mint_decimals (u8)
      offset += 1; // quote_mint_decimals (u8)
      offset += 8; // base_amount_in (u64)

      const quoteAmountIn = dataBuffer.readBigUInt64LE(offset);
      offset += 8;

      // Skip unused fields until we get to the ones we need
      offset += 8; // pool_base_amount
      offset += 8; // pool_quote_amount
      offset += 8; // minimum_liquidity
      offset += 8; // initial_liquidity
      offset += 8; // lp_token_amount_out
      offset += 1; // pool_bump

      const pool = new PublicKey(dataBuffer.slice(offset, offset + 32));

      const poolData: PoolData = {
        address: pool.toBase58(),
        mint: baseMint.toBase58(),
        lpSol: Number(quoteAmountIn) / 1e9, // Convert lamports to SOL
        creator: creator.toBase58(),
        source: 'PumpAMM',
        mintAuthority: null,
        freezeAuthority: null,
        creatorFee: 0,
        estimatedSlippage: 0,
      };

      return poolData;

    } catch (error) {
      console.error('[PUMP_AMM] Error manually parsing event:', error);
      return null;
    }
  }

  private _processLog(log: Logs) {
    const eventPrefix = 'Program data: ';
    const eventLog = log.logs.find(l => l.startsWith(eventPrefix));

    if (eventLog) {
      const base64Data = eventLog.substring(eventPrefix.length);
      const dataBuffer = Buffer.from(base64Data, 'base64');

      // First 8 bytes are the event discriminator, skip them
      const eventDataBuffer = dataBuffer.slice(8);

      const poolData = this._parseCreatePoolEvent(eventDataBuffer);
      if (poolData) {
        console.log(`[PUMP_AMM] Detected and parsed CreatePoolEvent in tx: ${log.signature}`);
        this._onNewPool(poolData);
      }
    }
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
      console.error(`[PumpAMM] Error in parallel processing for pool ${poolData.address}:`, error);
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
      const source = 'PumpAMM'.padEnd(12);
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
      console.error(`[PumpAMM] Error processing safety check for pool ${poolData.address}:`, error);
    }
  }
}

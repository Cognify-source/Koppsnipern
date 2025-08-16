import { Connection, PublicKey, Logs, clusterApiUrl, ParsedTransactionWithMeta } from '@solana/web3.js';
import { PoolData, SafetyService } from '../../services/safetyService';
import { IPoolListener, NewPoolCallback } from '../iPoolListener';
import { ConnectionManager } from '../../utils/connectionManager';
import { logSafePool, logBlockedPool } from '../../services/notifyService';
import { delayedLpChecker } from '../../services/delayedLpChecker';
import * as dotenv from 'dotenv';

dotenv.config();

export class PumpV1Listener implements IPoolListener {
  private _httpConnection: Connection;
  private _wsConnection: Connection;
  private _onNewPool: NewPoolCallback;
  private _signatureQueue: string[] = [];
  private _safetyService: SafetyService;

  constructor(callback: NewPoolCallback) {
    this._onNewPool = callback;
    this._safetyService = new SafetyService();
    
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
    const pumpV1ProgramId = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
    
    this._wsConnection.onLogs(pumpV1ProgramId, (log) => {
      if (!log.err) {
        this._signatureQueue.push(log.signature);
        // Don't process immediately - let timer handle batching to prevent queue overflow
      }
    });
    
    // Staggered execution: PumpV1 starts immediately (0ms offset)
    // Balanced 60ms intervals - important source but sustainable rate
        setInterval(() => {
            this._processSignatureQueue();
        }, 600);
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
        'PumpV1Listener'
      );

      for (const tx of txs) {
        if (tx) {
          const poolData = await this._extractPoolDataFromLog(tx);
          
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

  /**
   * Process safety check and LP monitoring in parallel for low-LP pools
   */
  private async _processParallelSafetyAndLpCheck(poolData: PoolData): Promise<void> {
    let safetyResult: any = null;
    let isPoolSafe = false;
    let lpFound = false;
    let finalPoolData = poolData;
    let processed = false; // Prevent double processing

    try {
      // Start safety check immediately (don't await yet)
      const safetyCheckPromise = this._safetyService.isPoolSafe(poolData);
      
      // Schedule LP monitoring with callback
      delayedLpChecker.scheduleCheck(poolData, async (updatedPoolData) => {
        if (processed) return; // Prevent double processing
        
        lpFound = true;
        finalPoolData = updatedPoolData;
        
        // If safety check is already done, process with updated LP data regardless of safety status
        if (safetyResult) {
          processed = true;
          // Re-run safety check with updated LP data to get correct result
          await this._processSafetyCheck(updatedPoolData, true);
        }
      });
      
      // Wait for safety check to complete
      safetyResult = await safetyCheckPromise;
      isPoolSafe = safetyResult.status === 'SAFE';
      
      // Always wait for LP result for low LP pools, regardless of safety status
      // If LP was already found while we were doing safety check, process immediately
      if (lpFound && !processed) {
        processed = true;
        await this._processSafetyCheck(finalPoolData, true);
      }
      // Otherwise, the LP callback will handle processing when LP is found (or timeout)
      
    } catch (error) {
      console.error(`[PumpV1] Error in parallel processing for pool ${poolData.address}:`, error);
    }
  }

  /**
   * Process safety check and handle logging/callbacks
   */
  private async _processSafetyCheck(poolData: PoolData, wasDelayedLpCheck: boolean = false): Promise<void> {
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
      const source = 'PumpV1'.padEnd(12);
      const address = poolData.address.padEnd(44);
      const lp = `LP:${poolData.lpSol.toFixed(3)}`.padEnd(12);
      const mintAuth = (poolData.mintAuthority ? '\x1b[31mMINT\x1b[0m' : '\x1b[32mNO_MINT\x1b[0m').padEnd(17); // 17 to account for ANSI codes
      const freezeAuth = (poolData.freezeAuthority ? '\x1b[31mFREEZE\x1b[0m' : '\x1b[32mNO_FREEZE\x1b[0m').padEnd(19); // 19 to account for ANSI codes
      const delayedIndicator = wasDelayedLpCheck ? '\x1b[33mDELAYED_LP\x1b[0m' : 'IMMEDIATE';
      
      console.log(`[${timestamp}] ${source} | \x1b[32m${address}\x1b[0m | ${lp} | ${mintAuth} | ${freezeAuth} | ${safetyStatus} | ${delayedIndicator}`);
      
      // Log to files
      if (safetyResult.status === 'SAFE') {
        await logSafePool(safetyResult);
        this._onNewPool(poolData);
      } else {
        await logBlockedPool(safetyResult, poolData);
      }
    } catch (error) {
      console.error(`[PumpV1] Error processing safety check for pool ${poolData.address}:`, error);
    }
  }
}

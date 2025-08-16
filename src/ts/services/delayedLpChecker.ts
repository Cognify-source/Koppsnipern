import { Connection, PublicKey } from '@solana/web3.js';
import { ConnectionManager } from '../utils/connectionManager';
import { PoolData } from './safetyService';

interface DelayedPoolCheck {
  poolData: PoolData;
  timestamp: number;
  retryCount: number;
  callback: (updatedPoolData: PoolData) => void;
}

export class DelayedLpChecker {
  private pendingChecks: Map<string, DelayedPoolCheck> = new Map();
  private connection: Connection;
  private readonly INITIAL_DELAY = 1000; // 1 second - much faster for copy trading
  private readonly MAX_RETRIES = 15; // More retries with shorter intervals
  private readonly RETRY_INTERVAL = 200; // 0.2 seconds between retries for better resolution
  private readonly MAX_PENDING_TIME = 4000; // 4 seconds max total time
  
  // Statistics tracking
  private lpFoundTimes: number[] = []; // Track timing for successful LP discoveries
  private totalScheduled = 0;
  private totalFound = 0;
  private totalTimedOut = 0;

  constructor() {
    this.connection = ConnectionManager.getHttpConnection();
    this.startProcessingLoop();
  }

  /**
   * Schedule a pool for delayed LP checking (PumpV1 only for now)
   */
  public scheduleCheck(poolData: PoolData, callback: (updatedPoolData: PoolData) => void): void {
    // Only handle PumpV1 for now
    if (poolData.source !== 'PumpV1') {
      callback(poolData);
      return;
    }

    // Only schedule if LP is currently 0 or very low
    if (poolData.lpSol >= 0.1) {
      callback(poolData);
      return;
    }

    const checkId = `${poolData.source}-${poolData.address}`;
    
    // Don't schedule duplicate checks
    if (this.pendingChecks.has(checkId)) {
      return;
    }

    // Silent scheduling

    this.totalScheduled++;
    this.pendingChecks.set(checkId, {
      poolData: { ...poolData },
      timestamp: Date.now(),
      retryCount: 0,
      callback
    });
  }

  /**
   * Main processing loop that checks pending pools
   */
  private startProcessingLoop(): void {
    setInterval(async () => {
      const now = Date.now();
      const toProcess: string[] = [];
      const toRemove: string[] = [];

      for (const [checkId, check] of this.pendingChecks.entries()) {
        const timeSinceScheduled = now - check.timestamp;
        
        // Remove checks that have been pending too long
        if (timeSinceScheduled > this.MAX_PENDING_TIME) {
          // Silent timeout
          this.totalTimedOut++;
          toRemove.push(checkId);
          continue;
        }

        // Check if it's time to process this check
        const shouldProcess = timeSinceScheduled >= this.INITIAL_DELAY + (check.retryCount * this.RETRY_INTERVAL);
        
        if (shouldProcess) {
          toProcess.push(checkId);
        }
      }

      // Remove timed out checks
      for (const checkId of toRemove) {
        this.pendingChecks.delete(checkId);
      }

      // Process ready checks
      for (const checkId of toProcess) {
        await this.processCheck(checkId);
      }
    }, 100); // Check every 100ms for high resolution timing
  }

  /**
   * Process a single delayed check
   */
  private async processCheck(checkId: string): Promise<void> {
    const check = this.pendingChecks.get(checkId);
    if (!check) return;

    try {
      const updatedLp = await this.checkPumpV1Liquidity(check.poolData);
      
      if (updatedLp > 0) {
        // Found liquidity! Calculate timing and update pool data
        const timeTaken = Date.now() - check.timestamp;
        const updatedPoolData = { ...check.poolData, lpSol: updatedLp };
        
        // Silent LP found - let the callback handle logging
        
        // Track statistics
        this.totalFound++;
        this.lpFoundTimes.push(timeTaken);
        
        // Keep only last 100 timing measurements to avoid memory bloat
        if (this.lpFoundTimes.length > 100) {
          this.lpFoundTimes.shift();
        }
        
        check.callback(updatedPoolData);
        this.pendingChecks.delete(checkId);
      } else {
        // Still no liquidity, retry if we haven't exceeded max retries
        check.retryCount++;
        
        if (check.retryCount >= this.MAX_RETRIES) {
          // Silent timeout
          this.pendingChecks.delete(checkId);
        }
        // Silent retry
      }
    } catch (error) {
      console.error(`[DELAYED_LP] Error checking LP for ${check.poolData.address}:`, error);
      check.retryCount++;
      
      if (check.retryCount >= this.MAX_RETRIES) {
        this.pendingChecks.delete(checkId);
      }
    }
  }

  /**
   * Check PumpV1 bonding curve liquidity by reading the account balance
   */
  private async checkPumpV1Liquidity(poolData: PoolData): Promise<number> {
    try {
      const bondingCurveAccount = new PublicKey(poolData.address);
      const accountInfo = await this.connection.getAccountInfo(bondingCurveAccount);
      
      if (!accountInfo) {
        return 0;
      }

      // For PumpV1, the SOL balance of the bonding curve account represents the liquidity
      const solBalance = accountInfo.lamports / 1e9;
      
      // Silent LP detection
      
      return solBalance;
    } catch (error) {
      console.error(`[DELAYED_LP] Error checking PumpV1 liquidity:`, error);
      return 0;
    }
  }

  /**
   * Get current status for monitoring
   */
  public getStatus(): { pendingChecks: number; oldestCheck: number | null } {
    const now = Date.now();
    let oldestCheck: number | null = null;
    
    for (const check of this.pendingChecks.values()) {
      const age = now - check.timestamp;
      if (oldestCheck === null || age > oldestCheck) {
        oldestCheck = age;
      }
    }
    
    return {
      pendingChecks: this.pendingChecks.size,
      oldestCheck
    };
  }

  /**
   * Get detailed timing statistics for optimization
   */
  public getTimingStats(): {
    totalScheduled: number;
    totalFound: number;
    totalTimedOut: number;
    successRate: number;
    avgTimeToLp: number;
    medianTimeToLp: number;
    minTimeToLp: number;
    maxTimeToLp: number;
  } {
    if (this.lpFoundTimes.length === 0) {
      return {
        totalScheduled: this.totalScheduled,
        totalFound: this.totalFound,
        totalTimedOut: this.totalTimedOut,
        successRate: 0,
        avgTimeToLp: 0,
        medianTimeToLp: 0,
        minTimeToLp: 0,
        maxTimeToLp: 0
      };
    }

    const sortedTimes = [...this.lpFoundTimes].sort((a, b) => a - b);
    const avg = this.lpFoundTimes.reduce((sum, time) => sum + time, 0) / this.lpFoundTimes.length;
    const median = sortedTimes[Math.floor(sortedTimes.length / 2)];
    const min = sortedTimes[0];
    const max = sortedTimes[sortedTimes.length - 1];
    const successRate = this.totalScheduled > 0 ? (this.totalFound / this.totalScheduled) * 100 : 0;

    return {
      totalScheduled: this.totalScheduled,
      totalFound: this.totalFound,
      totalTimedOut: this.totalTimedOut,
      successRate: Math.round(successRate * 10) / 10, // Round to 1 decimal
      avgTimeToLp: Math.round(avg),
      medianTimeToLp: Math.round(median),
      minTimeToLp: Math.round(min),
      maxTimeToLp: Math.round(max)
    };
  }
}

// Singleton instance
export const delayedLpChecker = new DelayedLpChecker();

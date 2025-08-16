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
  private readonly INITIAL_DELAY = 300; // 300ms - ultra-aggressive timing for immediate LP detection
  private readonly MAX_RETRIES = 35; // More retries with ultra-tight intervals
  private readonly RETRY_INTERVAL = 100; // 0.1 seconds between retries - ultra-tight timing
  private readonly MAX_PENDING_TIME = 4000; // 4 seconds max total time
  private readonly MAX_CONCURRENT_CHECKS = 5; // Limit concurrent LP checks to control RPS
  
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
   * Schedule a pool for delayed LP checking (supports all pool types)
   */
  public scheduleCheck(poolData: PoolData, callback: (updatedPoolData: PoolData) => void): void {
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

      // Process ready checks with concurrency limit to control RPS
      const checksToProcess = toProcess.slice(0, this.MAX_CONCURRENT_CHECKS);
      for (const checkId of checksToProcess) {
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
      let updatedLp = 0;
      
      // Check LP based on pool source type
      switch (check.poolData.source) {
        case 'PumpV1':
          updatedLp = await this.checkPumpV1Liquidity(check.poolData);
          break;
        case 'PumpAMM':
          updatedLp = await this.checkPumpAmmLiquidity(check.poolData);
          break;
        case 'LaunchLab':
          updatedLp = await this.checkLaunchLabLiquidity(check.poolData);
          break;
        case 'MeteoraDBC':
          updatedLp = await this.checkMeteoraDbcLiquidity(check.poolData);
          break;
        default:
          console.error(`[DELAYED_LP] Unknown pool source: ${check.poolData.source}`);
          updatedLp = 0;
      }
      
      if (updatedLp > 0) {
        // Found liquidity! Calculate timing and update pool data
        const timeTaken = Date.now() - check.timestamp;
        // Only update LP - let SafetyService handle mint/freeze authorities
        const updatedPoolData = { 
          ...check.poolData, 
          lpSol: updatedLp
        };
        
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
   * Check PumpV1 bonding curve liquidity and mint/freeze authorities
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
   * Check PumpAMM pool liquidity by reading pool account balance
   */
  private async checkPumpAmmLiquidity(poolData: PoolData): Promise<number> {
    try {
      const poolAccount = new PublicKey(poolData.address);
      const accountInfo = await this.connection.getAccountInfo(poolAccount);
      
      if (!accountInfo) {
        return 0;
      }

      // For PumpAMM, check SOL balance of the pool account
      const solBalance = accountInfo.lamports / 1e9;
      return solBalance;
    } catch (error) {
      console.error(`[DELAYED_LP] Error checking PumpAMM liquidity:`, error);
      return 0;
    }
  }

  /**
   * Check LaunchLab pool liquidity by reading pool account balance
   */
  private async checkLaunchLabLiquidity(poolData: PoolData): Promise<number> {
    try {
      const poolAccount = new PublicKey(poolData.address);
      const accountInfo = await this.connection.getAccountInfo(poolAccount);
      
      if (!accountInfo) {
        return 0;
      }

      // For LaunchLab, check SOL balance of the pool account
      const solBalance = accountInfo.lamports / 1e9;
      return solBalance;
    } catch (error) {
      console.error(`[DELAYED_LP] Error checking LaunchLab liquidity:`, error);
      return 0;
    }
  }

  /**
   * Check MeteoraDBC pool liquidity by reading pool account balance
   */
  private async checkMeteoraDbcLiquidity(poolData: PoolData): Promise<number> {
    try {
      const poolAccount = new PublicKey(poolData.address);
      const accountInfo = await this.connection.getAccountInfo(poolAccount);
      
      if (!accountInfo) {
        return 0;
      }

      // For MeteoraDBC, check SOL balance of the pool account
      const solBalance = accountInfo.lamports / 1e9;
      return solBalance;
    } catch (error) {
      console.error(`[DELAYED_LP] Error checking MeteoraDBC liquidity:`, error);
      return 0;
    }
  }

  /**
   * Check current mint and freeze authorities for a token
   */
  private async checkTokenAuthorities(mintAddress: string): Promise<{mintAuthority: string | null, freezeAuthority: string | null}> {
    try {
      const mintAccount = new PublicKey(mintAddress);
      const mintInfo = await this.connection.getParsedAccountInfo(mintAccount);
      
      if (!mintInfo.value || !mintInfo.value.data || typeof mintInfo.value.data !== 'object' || !('parsed' in mintInfo.value.data)) {
        return { mintAuthority: 'UNKNOWN', freezeAuthority: 'UNKNOWN' };
      }

      const parsedData = mintInfo.value.data.parsed;
      const mintAuthority = parsedData.info.mintAuthority;
      const freezeAuthority = parsedData.info.freezeAuthority;

      return {
        mintAuthority: mintAuthority,
        freezeAuthority: freezeAuthority
      };
    } catch (error) {
      console.error(`[DELAYED_LP] Error checking token authorities:`, error);
      return { mintAuthority: 'UNKNOWN', freezeAuthority: 'UNKNOWN' };
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

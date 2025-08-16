import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';

// Pool data interface
export interface PoolData {
  address: string;
  mint: string;
  source: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  lpSol: number;
  creatorFee: number;
  estimatedSlippage: number;
  slippage?: number; // Add optional slippage property
  creator: string;
}

// Pool interface (alias for compatibility)
export interface Pool extends PoolData {}

export interface SafetyResult {
  pool: Pool;
  status: 'SAFE' | 'BLOCKED';
  reasons: string[];
  latency: number;
}

interface AuthorityCheckResult {
  actualMintAuthority: string | null;
  actualFreezeAuthority: string | null;
}

// Add configuration for freeze authority policy
const FREEZE_AUTHORITY_POLICY = {
  // For copy-trading with 2-10 second holds, we can be more lenient with freeze authority
  // since the risk window is very short
  ALLOW_FREEZE_AUTHORITY_FOR_COPY_TRADING: process.env.ALLOW_FREEZE_AUTHORITY_COPY_TRADING === 'true',
  
  // Minimum LP threshold - even with freeze authority, we want some liquidity
  MIN_LP_WITH_FREEZE_AUTHORITY: 1.0, // SOL
  
  // Maximum acceptable latency even with freeze authority
  MAX_RTT_WITH_FREEZE_AUTHORITY: 150 // ms
};

// RTT filter configuration - more lenient for copy-trading
const RTT_POLICY = {
  // Enable/disable RTT filtering entirely
  ENABLE_RTT_FILTER: process.env.ENABLE_RTT_FILTER !== 'false', // Default enabled, can disable
  
  // Standard RTT limit (conservative for arbitrage)
  STANDARD_MAX_RTT: 150, // ms
  
  // Copy-trading RTT limit (more lenient since speed is less critical)
  COPY_TRADING_MAX_RTT: 500, // ms - allows for network variations
  
  // Use copy-trading limits when freeze authority is allowed
  USE_COPY_TRADING_LIMITS: process.env.ALLOW_FREEZE_AUTHORITY_COPY_TRADING === 'true'
};

async function checkActualAuthorities(mintAccount: PublicKey): Promise<AuthorityCheckResult> {
  try {
    const httpRpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(httpRpcUrl, 'confirmed');
    
    const accountInfo = await connection.getAccountInfo(mintAccount);
    if (!accountInfo || !accountInfo.data) {
      return { actualMintAuthority: 'UNKNOWN', actualFreezeAuthority: 'UNKNOWN' };
    }

    const data = accountInfo.data;
    
    // Check if buffer is large enough for mint account structure (should be 82 bytes)
    if (data.length < 82) {
      console.warn(`Mint account data too small: ${data.length} bytes, expected 82`);
      return { actualMintAuthority: 'UNKNOWN', actualFreezeAuthority: 'UNKNOWN' };
    }
    
    // Parse mint account structure with bounds checking
    // Bytes 0-3: mint authority option (0 = none, 1 = some)
    // Bytes 4-35: mint authority pubkey (if option = 1)
    // Bytes 36-39: supply (8 bytes, but we skip)
    // Bytes 44: decimals
    // Bytes 45: is_initialized
    // Bytes 46-49: freeze authority option (0 = none, 1 = some)
    // Bytes 50-81: freeze authority pubkey (if option = 1)
    
    let actualMintAuthority: string | null = null;
    let actualFreezeAuthority: string | null = null;
    
    // Check mint authority with bounds checking
    if (data.length >= 4) {
      const mintAuthorityOption = data.readUInt32LE(0);
      if (mintAuthorityOption === 1 && data.length >= 36) {
        const mintAuthorityBytes = data.slice(4, 36);
        actualMintAuthority = new PublicKey(mintAuthorityBytes).toString();
      }
    }
    
    // Check freeze authority with bounds checking
    if (data.length >= 50) {
      const freezeAuthorityOption = data.readUInt32LE(46);
      if (freezeAuthorityOption === 1 && data.length >= 82) {
        const freezeAuthorityBytes = data.slice(50, 82);
        actualFreezeAuthority = new PublicKey(freezeAuthorityBytes).toString();
      }
    }
    
    return { actualMintAuthority, actualFreezeAuthority };
  } catch (error) {
    console.error('Error checking actual authorities:', error);
    return { actualMintAuthority: 'UNKNOWN', actualFreezeAuthority: 'UNKNOWN' };
  }
}

export async function evaluatePoolSafety(pool: Pool): Promise<SafetyResult> {
  const startTime = Date.now();
  const reasons: string[] = [];
  
  try {
    // Get actual authority status from mint account
    const mintAccount = new PublicKey(pool.mint);
    const { actualMintAuthority, actualFreezeAuthority } = await checkActualAuthorities(mintAccount);
    
    // Update pool data with actual authorities
    pool.mintAuthority = actualMintAuthority;
    pool.freezeAuthority = actualFreezeAuthority;
    
    // Check mint authority (always block if present)
    if (actualMintAuthority && actualMintAuthority !== 'UNKNOWN') {
      reasons.push('Mint authority present');
    }
    
    // Check freeze authority with graduated policy
    let freezeAuthorityBlocked = false;
    if (actualFreezeAuthority && actualFreezeAuthority !== 'UNKNOWN') {
      if (FREEZE_AUTHORITY_POLICY.ALLOW_FREEZE_AUTHORITY_FOR_COPY_TRADING) {
        // For copy-trading mode: allow freeze authority if other conditions are met
        if (pool.lpSol < FREEZE_AUTHORITY_POLICY.MIN_LP_WITH_FREEZE_AUTHORITY) {
          reasons.push('Freeze authority present with insufficient LP');
          freezeAuthorityBlocked = true;
        } else {
          // Log but don't block - acceptable risk for short-term trades
          console.log(`[COPY-TRADING MODE] Allowing freeze authority for pool ${pool.address} with ${pool.lpSol} SOL LP`);
        }
      } else {
        // Standard mode: block all freeze authority
        reasons.push('Freeze authority present');
        freezeAuthorityBlocked = true;
      }
    }
    
    // Check LP amount
    if (pool.lpSol < 1) {
      reasons.push(`LP too low (${pool.lpSol} SOL)`);
    }
    
    // Check latency with new RTT policy
    const latency = Date.now() - startTime;
    
    if (RTT_POLICY.ENABLE_RTT_FILTER) {
      let maxRtt: number;
      
      if (RTT_POLICY.USE_COPY_TRADING_LIMITS) {
        // Copy-trading mode: more lenient RTT limits
        maxRtt = RTT_POLICY.COPY_TRADING_MAX_RTT;
      } else {
        // Standard mode: conservative RTT limits
        maxRtt = RTT_POLICY.STANDARD_MAX_RTT;
      }
      
      if (latency > maxRtt) {
        reasons.push(`RTT too high (${latency}ms, max: ${maxRtt}ms)`);
      }
    }
    // If RTT filter is disabled, skip RTT check entirely
    
    // Determine final status
    const isBlocked = reasons.length > 0 || 
                     (actualMintAuthority && actualMintAuthority !== 'UNKNOWN') ||
                     freezeAuthorityBlocked;
    
    return {
      pool,
      status: isBlocked ? 'BLOCKED' : 'SAFE',
      reasons,
      latency
    };
    
  } catch (error) {
    console.error('Error evaluating pool safety:', error);
    return {
      pool,
      status: 'BLOCKED',
      reasons: ['Safety evaluation failed'],
      latency: Date.now() - startTime
    };
  }
}

// Logging functions
export async function logSafePool(result: SafetyResult): Promise<void> {
  try {
    const fs = await import('fs/promises');
    const logEntry = {
      timestamp: new Date().toISOString(),
      pool: result.pool.address,
      status: result.status,
      latency: result.latency,
      lp: result.pool.lpSol,
      creator_fee: result.pool.creatorFee || 0,
      slippage: result.pool.slippage || 0,
      reasons: result.reasons,
      source: result.pool.source
    };
    
    let existingData = [];
    try {
      const existingContent = await fs.readFile('logs/safe_pools.json', 'utf-8');
      existingData = JSON.parse(existingContent);
    } catch (error) {
      // File doesn't exist or is empty, start with empty array
    }
    
    existingData.push(logEntry);
    await fs.writeFile('logs/safe_pools.json', JSON.stringify(existingData, null, 2));
  } catch (error) {
    console.error('Error logging safe pool:', error);
  }
}

export async function logBlockedPool(result: SafetyResult, poolData: any): Promise<void> {
  try {
    const fs = await import('fs/promises');
    const logEntry = {
      timestamp: new Date().toISOString(),
      pool: result.pool.address,
      mint: result.pool.mint,
      reasons: result.reasons,
      source: result.pool.source
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    await fs.appendFile('logs/blocked_pools.jsonl', logLine);
  } catch (error) {
    console.error('Error logging blocked pool:', error);
  }
}

// SafetyService class for backward compatibility
export class SafetyService {
  async isPoolSafe(poolData: PoolData): Promise<SafetyResult> {
    return await evaluatePoolSafety(poolData);
  }
}

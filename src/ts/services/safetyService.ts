// safetyService.ts
// Modular safety checks, batched RPC calls, latency tracking, and logging.

import fs from 'fs';
import dotenv from 'dotenv';
import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import { getTokenMetadataWarnings } from '../utils/tokenMetadataUtils';

dotenv.config({ debug: false });

const SAFE_LOG_FILE = './logs/safe_pools.json';
const BLOCK_LOG_FILE = './logs/blocked_pools.jsonl';
const BLACKLIST_FILE = './config/creator_blacklist.json';
const LOCKERS_FILE = './config/lp_lockers.json';

const CREATOR_BLACKLIST: string[] = fs.existsSync(BLACKLIST_FILE)
  ? JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'))
  : [];

const LP_LOCKERS: string[] = fs.existsSync(LOCKERS_FILE)
  ? JSON.parse(fs.readFileSync(LOCKERS_FILE, 'utf8'))
  : [];

if (CREATOR_BLACKLIST.length === 0) {
  console.log('ℹ️ Creator wallet blacklist is empty - this check will be skipped.');
}
if (LP_LOCKERS.length === 0) {
  console.log('ℹ️ LP lockers list is empty - this check will be skipped.');
}

export interface PoolData {
  address: string;
  mint: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  lpSol: number;
  creatorFee: number;
  estimatedSlippage: number;
  creator?: string;
  source?: string;
}

export interface SafetyResult {
  timestamp: string;
  pool: string;
  status: 'SAFE' | 'BLOCKED';
  latency: number;
  lp: number;
  creator_fee: number;
  slippage: number;
  reasons: string[];
  source?: string;
}

const DEBUG_RUG_CHECKS = process.env.DEBUG_RUG_CHECKS === 'true';

// Import ConnectionManager for shared connection
import { ConnectionManager } from '../utils/connectionManager';
const connection = ConnectionManager.getHttpConnection();

function isValidPublicKey(key: string | undefined | null): boolean {
  if (!key) return false;
  try {
    new PublicKey(key);
    return true;
  } catch {
    return false;
  }
}

export async function checkPoolSafety(pool: PoolData): Promise<SafetyResult> {
  const reasons: string[] = [];
  const startAll = performance.now();
  const metaplex = Metaplex.make(connection);

  if (!isValidPublicKey(pool.mint)) reasons.push('Invalid mint public key');
  if (!isValidPublicKey(pool.address)) reasons.push('Invalid LP address');

  const startBasic = performance.now();
  if (pool.mintAuthority !== null) reasons.push('Mint authority present');
  if (pool.freezeAuthority !== null) reasons.push('Freeze authority present');

  const minLpSol = Number(process.env.FILTER_MIN_LP_SOL) || 2;
  if (pool.lpSol < minLpSol) reasons.push(`LP too low (${pool.lpSol} SOL)`);

  const maxCreatorFee = Number(process.env.FILTER_MAX_CREATOR_FEE_PERCENT) || 5;
  if (pool.creatorFee > maxCreatorFee) reasons.push(`Creator fee too high (${pool.creatorFee}%)`);

  const maxSlippage = Number(process.env.FILTER_MAX_SLIPPAGE_PERCENT) || 3;
  if (pool.estimatedSlippage > maxSlippage) reasons.push(`Slippage too high (${pool.estimatedSlippage}%)`);

  if (DEBUG_RUG_CHECKS) console.log(`⏱ Basic checks: ${(performance.now() - startBasic).toFixed(1)} ms`);

  // RTT Latency check
  const startRtt = performance.now();
  const rttLatency = await measureRttLatency();
  const maxRttMs = Number(process.env.FILTER_MAX_RTT_MS) || 150;
  if (rttLatency > maxRttMs) reasons.push(`RTT too high (${rttLatency}ms)`);
  if (DEBUG_RUG_CHECKS) console.log(`⏱ RTT check: ${(performance.now() - startRtt).toFixed(1)} ms (RTT: ${rttLatency}ms)`);

  /*
  const metadataWarnings = await getTokenMetadataWarnings(new PublicKey(pool.mint), metaplex);;
  if (metadataWarnings.length > 0) {
    reasons.push(...metadataWarnings);
    pool.source = (pool.source || 'unknown') + ' +metadata';
  }
  */

  if (reasons.length === 0) {
    const startBatch = performance.now();
    const extraReasons = await runAdvancedChecks(pool);
    reasons.push(...extraReasons);
    if (DEBUG_RUG_CHECKS) console.log(`⏱ Advanced checks (batch RPC): ${(performance.now() - startBatch).toFixed(1)} ms`);
  }

  // Sell simulation check - only if all other checks pass
  if (reasons.length === 0) {
    const startSell = performance.now();
    const sellSimulationPassed = await simulateSellTransaction(pool);
    if (!sellSimulationPassed) reasons.push('Sell simulation failed');
    if (DEBUG_RUG_CHECKS) console.log(`⏱ Sell simulation: ${(performance.now() - startSell).toFixed(1)} ms`);
  }

  const status: 'SAFE' | 'BLOCKED' = reasons.length === 0 ? 'SAFE' : 'BLOCKED';
  const latency = Math.round(performance.now() - startAll);

  // The final result object, without the logging side-effects.
  const result: SafetyResult = {
    timestamp: new Date().toISOString(),
    pool: pool.address,
    status,
    latency,
    lp: pool.lpSol,
    creator_fee: pool.creatorFee,
    slippage: pool.estimatedSlippage,
    reasons,
    source: pool.source || 'unknown'
  };

  return result;
}

async function runAdvancedChecks(pool: PoolData): Promise<string[]> {
  const reasons: string[] = [];
  const mintPk = new PublicKey(pool.mint);
  const accountsToFetch: PublicKey[] = [mintPk];

  let poolPk: PublicKey | null = null;
  if (LP_LOCKERS.length > 0) {
    poolPk = new PublicKey(pool.address);
    accountsToFetch.push(poolPk);
  }

  const startRpc = performance.now();
  const accounts = await connection.getMultipleAccountsInfo(accountsToFetch);
  if (DEBUG_RUG_CHECKS) console.log(`⏱ RPC fetch: ${(performance.now() - startRpc).toFixed(1)} ms`);

  /*
  const startHolder = performance.now();
  if (await failsHolderDistribution(mintPk)) {
    reasons.push('Top token holders own too much supply');
  }
  if (DEBUG_RUG_CHECKS) console.log(`⏱ Holder distribution: ${(performance.now() - startHolder).toFixed(1)} ms`);
  */

  const startCreator = performance.now();
  if (failsCreatorWalletRisk(pool.creator)) {
    reasons.push('Creator wallet is blacklisted');
  }
  if (DEBUG_RUG_CHECKS) console.log(`⏱ Creator wallet risk: ${(performance.now() - startCreator).toFixed(1)} ms`);

  if (poolPk) {
    const startLock = performance.now();
    const accountInfo = accounts[accountsToFetch.length - 1];
    if (accountInfo) {
      const owner = accountInfo.owner.toBase58();
      if (!LP_LOCKERS.includes(owner)) {
        reasons.push('LP tokens are not locked in a trusted locker');
      }
    } else {
      reasons.push('LP account info not found');
    }
    if (DEBUG_RUG_CHECKS) console.log(`⏱ Liquidity lock: ${(performance.now() - startLock).toFixed(1)} ms`);
  }

  return reasons;
}
/*
async function failsHolderDistribution(mintPk: PublicKey): Promise<boolean> {
  try {
    const largestAccounts = await connection.getTokenLargestAccounts(mintPk);
    const supplyInfo = await connection.getTokenSupply(mintPk);
    const totalSupply = Number(supplyInfo.value.amount);
    if (!totalSupply) return false;
    const topThree = largestAccounts.value.slice(0, 3).reduce((sum, acc) => sum + Number(acc.amount), 0);
    return (topThree / totalSupply) * 100 > 50;
  } catch {
    return false;
  }
}
*/
function failsCreatorWalletRisk(creator?: string): boolean {
  if (!creator || CREATOR_BLACKLIST.length === 0) return false;
  return CREATOR_BLACKLIST.includes(creator);
}

async function measureRttLatency(): Promise<number> {
  const startTime = performance.now();
  try {
    // Simple ping-like request to measure RTT
    await connection.getSlot();
    return Math.round(performance.now() - startTime);
  } catch (error) {
    if (DEBUG_RUG_CHECKS) console.error('RTT measurement failed:', error);
    return 999; // Return high latency on error to trigger filter
  }
}

async function simulateSellTransaction(pool: PoolData): Promise<boolean> {
  try {
    // This is a placeholder implementation
    // In a real implementation, you would:
    // 1. Create a small buy transaction simulation
    // 2. Then simulate selling those tokens back
    // 3. Check if both simulations succeed
    
    // For now, we'll do a basic check by trying to get the pool account info
    const poolPk = new PublicKey(pool.address);
    const accountInfo = await connection.getAccountInfo(poolPk);
    
    if (!accountInfo) {
      if (DEBUG_RUG_CHECKS) console.log('Sell simulation: Pool account not found');
      return false;
    }
    
    // TODO: Implement actual buy/sell simulation using Jupiter or similar
    // For development purposes, we'll assume simulation passes if pool exists
    if (DEBUG_RUG_CHECKS) console.log('Sell simulation: Basic check passed (placeholder)');
    return true;
    
  } catch (error) {
    if (DEBUG_RUG_CHECKS) console.error('Sell simulation failed:', error);
    return false;
  }
}

export class SafetyService {
  /**
   * Checks if a pool is safe by running a series of checks.
   * This method is now purely for logic and does not perform any logging.
   * @param pool The pool data to check.
   * @returns A SafetyResult object with the outcome of the checks.
   */
  public async isPoolSafe(pool: PoolData): Promise<SafetyResult> {
    return await checkPoolSafety(pool);
  }
}

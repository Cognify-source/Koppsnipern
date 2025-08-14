// safetyService.ts
// Modular safety checks, batched RPC calls, latency tracking, and logging.

import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import { getTokenMetadataWarnings } from '@utils/tokenMetadataUtils';

dotenv.config({ override: true, debug: false });

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
const connection = new Connection(
  process.env.SOLANA_HTTP_RPC_URL || 'https://api.mainnet-beta.solana.com',
  'confirmed'
);

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

  const minLpSol = Number(process.env.FILTER_MIN_LP_SOL) || 10;
  if (pool.lpSol < minLpSol) reasons.push(`LP too low (${pool.lpSol} SOL)`);

  const maxCreatorFee = Number(process.env.FILTER_MAX_CREATOR_FEE_PERCENT) || 5;
  if (pool.creatorFee > maxCreatorFee) reasons.push(`Creator fee too high (${pool.creatorFee}%)`);

  const maxSlippage = Number(process.env.FILTER_MAX_SLIPPAGE_PERCENT) || 3;
  if (pool.estimatedSlippage > maxSlippage) reasons.push(`Slippage too high (${pool.estimatedSlippage}%)`);

  if (DEBUG_RUG_CHECKS) console.log(`⏱ Basic checks: ${(performance.now() - startBasic).toFixed(1)} ms`);

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

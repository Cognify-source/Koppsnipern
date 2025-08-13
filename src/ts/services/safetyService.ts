// safetyService.ts – utvecklingsläge
// SafetyService med modulära rug checks, batch-RPC, latency per check, blockering av ogiltiga nycklar och blockloggning

import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import { getTokenMetadataWarnings } from '@utils/tokenMetadataUtils';

dotenv.config({ override: true, debug: false });

const LOG_FILE = './logs/safety_checks.jsonl';
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
  console.log('ℹ️ Creator wallet blacklist är tom – ingen blockering på denna check.');
}
if (LP_LOCKERS.length === 0) {
  console.log('ℹ️ LP-lockers-listan är tom – ingen blockering på denna check.');
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

interface SafetyResult {
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

const BLACKLIST = new Set<string>(['mintAddress1', 'mintAddress2']);
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
  if (pool.lpSol < 10) reasons.push(`LP too low (${pool.lpSol} SOL)`);
  if (pool.creatorFee > 5) reasons.push(`Creator fee too high (${pool.creatorFee}%)`);
  if (BLACKLIST.has(pool.mint)) reasons.push('Mint is blacklisted');
  if (pool.estimatedSlippage > 3) reasons.push(`Slippage too high (${pool.estimatedSlippage}%)`);
  if (DEBUG_RUG_CHECKS) console.log(`⏱ Basic checks: ${(performance.now() - startBasic).toFixed(1)} ms`);

  const metadataWarnings = await getTokenMetadataWarnings(new PublicKey(pool.mint), metaplex);;
  if (metadataWarnings.length > 0) {
    reasons.push(...metadataWarnings);
    pool.source = (pool.source || 'unknown') + ' +metadata';
  }

  if (reasons.length === 0) {
    const startBatch = performance.now();
    const extraReasons = await runAdvancedChecks(pool);
    reasons.push(...extraReasons);
    if (DEBUG_RUG_CHECKS) console.log(`⏱ Advanced checks (batch RPC): ${(performance.now() - startBatch).toFixed(1)} ms`);
  }

  const status: 'SAFE' | 'BLOCKED' = reasons.length === 0 ? 'SAFE' : 'BLOCKED';
  const latency = Math.round(performance.now() - startAll);

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

  if (status === 'SAFE') {
    await logResult(result);
  } else {
    await logBlockedPool(result, pool);
  }

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

  const startHolder = performance.now();
  if (await failsHolderDistribution(mintPk)) {
    reasons.push('Top token holders own too much supply');
  }
  if (DEBUG_RUG_CHECKS) console.log(`⏱ Holder distribution: ${(performance.now() - startHolder).toFixed(1)} ms`);

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

function failsCreatorWalletRisk(creator?: string): boolean {
  if (!creator || CREATOR_BLACKLIST.length === 0) return false;
  return CREATOR_BLACKLIST.includes(creator);
}

async function logResult(result: SafetyResult): Promise<void> {
  try {
    if (!fs.existsSync('./logs')) fs.mkdirSync('./logs', { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(result) + '\n');
    console.log(`💾 Loggad lokalt: ${result.status} – ${result.pool}`);
  } catch (err) {
    console.error('Kunde inte skriva till lokal loggfil:', err);
  }

  const discordWebhook = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!discordWebhook) return;

  const discordMessage = {
    content: `✅ SAFE – Källa: ${result.source} – Pool: ${result.pool}\nLP: ${result.lp.toFixed(2)} SOL | Fee: ${result.creator_fee.toFixed(2)}% | Slippage: ${result.slippage.toFixed(2)}%`
  };

  try {
    const res = await fetch(discordWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordMessage)
    });
    if (res.ok) console.log(`📨 Discord-logg skickad: ${result.status} – ${result.pool}`);
  } catch {}
}

async function logBlockedPool(result: SafetyResult, pool: PoolData): Promise<void> {
  try {
    if (!fs.existsSync('./logs')) fs.mkdirSync('./logs', { recursive: true });
    const logEntry = {
      timestamp: result.timestamp,
      pool: pool.address,
      mint: pool.mint,
      reasons: result.reasons,
      source: pool.source || 'unknown'
    };
    fs.appendFileSync(BLOCK_LOG_FILE, JSON.stringify(logEntry) + '\n');
    console.log(`🚫 Blockerad pool loggad: ${pool.address}`);
  } catch (err) {
    console.error('Kunde inte skriva till blocked_pools-logg:', err);
  }
}

export class SafetyService {
  public async isPoolSafe(pool: PoolData): Promise<boolean> {
    const result = await checkPoolSafety(pool);
    return result.status === 'SAFE';
  }
}

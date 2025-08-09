// safetyService.ts – utvecklingsläge
// SafetyService med modulära rug checks och loggning av endast SAFE-pooler

import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { Connection, PublicKey } from '@solana/web3.js';

dotenv.config({ override: true, debug: false });

const LOG_FILE = './logs/safety_checks.jsonl';
const BLACKLIST_FILE = './config/creator_blacklist.json';
const LOCKERS_FILE = './config/lp_lockers.json';

// Ladda blacklist och lockers
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

interface PoolData {
  address: string;
  mint: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  lpSol: number;
  creatorFee: number;
  estimatedSlippage: number;
  creator?: string; // lägg till creator wallet
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

const BLACKLIST = new Set<string>([
  'mintAddress1',
  'mintAddress2'
]);

const connection = new Connection(process.env.SOLANA_HTTP_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');

export async function checkPoolSafety(pool: PoolData): Promise<SafetyResult> {
  const reasons: string[] = [];
  const start = performance.now();

  // Grundläggande OP-baserade checks
  if (pool.mintAuthority !== null) {
    reasons.push('Mint authority present');
  }
  if (pool.freezeAuthority !== null) {
    reasons.push('Freeze authority present');
  }
  if (pool.lpSol < 10) { // enligt din nya min-gräns
    reasons.push(`LP too low (${pool.lpSol} SOL)`);
  }
  if (pool.creatorFee > 5) {
    reasons.push(`Creator fee too high (${pool.creatorFee}%)`);
  }
  if (BLACKLIST.has(pool.mint)) {
    reasons.push('Mint is blacklisted');
  }
  if (pool.estimatedSlippage > 3) {
    reasons.push(`Slippage too high (${pool.estimatedSlippage}%)`);
  }

  // Nya rug checks
  if (await failsHolderDistribution(pool.mint)) {
    reasons.push('Top token holders own too much supply');
  }
  if (failsCreatorWalletRisk(pool.creator)) {
    reasons.push('Creator wallet is blacklisted');
  }
  if (await failsLiquidityLock(pool.address)) {
    reasons.push('LP tokens are not locked in a trusted locker');
  }

  const status: 'SAFE' | 'BLOCKED' = reasons.length === 0 ? 'SAFE' : 'BLOCKED';
  const latency = Math.round(performance.now() - start);

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

  // Endast logga SAFE-pooler
  if (status === 'SAFE') {
    await logResult(result);
  }

  return result;
}

// #2 Holder distribution check
async function failsHolderDistribution(mint: string): Promise<boolean> {
  try {
    const mintPk = new PublicKey(mint);
    const supplyInfo = await connection.getTokenSupply(mintPk);
    const totalSupply = Number(supplyInfo.value.amount);
    if (!totalSupply || totalSupply <= 0) return false;

    const largestAccounts = await connection.getTokenLargestAccounts(mintPk);
    const topThree = largestAccounts.value.slice(0, 3).reduce((sum, acc) => sum + Number(acc.amount), 0);
    const percentTopThree = (topThree / totalSupply) * 100;

    return percentTopThree > 50; // Blockera om topp 3 äger mer än 50%
  } catch {
    return false; // Misslyckad fetch = inte blockera
  }
}

// #4 Creator wallet risk
function failsCreatorWalletRisk(creator?: string): boolean {
  if (!creator) return false;
  if (CREATOR_BLACKLIST.length === 0) return false;
  return CREATOR_BLACKLIST.includes(creator);
}

// #5 Liquidity lock check
async function failsLiquidityLock(poolAddress: string): Promise<boolean> {
  if (LP_LOCKERS.length === 0) return false;

  try {
    const poolPk = new PublicKey(poolAddress);
    const accountInfo = await connection.getAccountInfo(poolPk);
    if (!accountInfo) return true; // ingen info = osäkert
    const owner = accountInfo.owner.toBase58();
    return !LP_LOCKERS.includes(owner);
  } catch {
    return true; // vid fel, anta osäkert
  }
}

async function logResult(result: SafetyResult): Promise<void> {
  try {
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { recursive: true });
    }
    fs.appendFileSync(LOG_FILE, JSON.stringify(result) + '\n');
    console.log(`💾 Loggad lokalt: ${result.status} – ${result.pool}`);
  } catch (err) {
    console.error('Kunde inte skriva till lokal loggfil:', err);
  }

  const discordWebhook = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!discordWebhook) {
    return;
  }

  const discordMessage = {
    content: `✅ SAFE – Källa: ${result.source} – Pool: ${result.pool}\nLP: ${result.lp.toFixed(2)} SOL | Fee: ${result.creator_fee.toFixed(2)}% | Slippage: ${result.slippage.toFixed(2)}%`
  };

  try {
    const res = await fetch(discordWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordMessage)
    });
    if (res.ok) {
      console.log(`📨 Discord-logg skickad: ${result.status} – ${result.pool}`);
    }
  } catch {
    // Tyst felhantering
  }
}

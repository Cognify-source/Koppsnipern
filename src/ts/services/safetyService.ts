// safetyService.ts (utvecklingsläge)
// SafetyService v1 – snabb rug check + loggning till Discord och lokal JSONL-fil

import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config({ override: true, debug: false });

const LOG_FILE = './logs/safety_checks.jsonl';

interface PoolData {
  address: string;
  mint: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  lpSol: number;
  creatorFee: number;
  estimatedSlippage: number;
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

export async function checkPoolSafety(pool: PoolData): Promise<SafetyResult> {
  const reasons: string[] = [];
  const start = performance.now();

  if (pool.mintAuthority !== null) {
    reasons.push('Mint authority present');
  }
  if (pool.freezeAuthority !== null) {
    reasons.push('Freeze authority present');
  }
  if (pool.lpSol < 10) {
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

  await logResult(result);
  return result;
}

async function logResult(result: SafetyResult): Promise<void> {
  // Se till att logg skrivs till fil oavsett Discord
  try {
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { recursive: true });
    }
    fs.appendFileSync(LOG_FILE, JSON.stringify(result) + '\n');
    console.log(`💾 Loggad lokalt: ${result.status} – ${result.pool}`);
  } catch (err) {
    console.error('Kunde inte skriva till lokal loggfil:', err);
  }

  // Läs webhook dynamiskt
  const discordWebhook = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!discordWebhook) {
    console.warn('⚠️ Ingen Discord-webhook angiven – hoppar över Discord-loggning.');
    return;
  }

  const discordMessage = {
    content: `${result.status === 'SAFE' ? '✅ SAFE' : '⛔ BLOCKED'} – Källa: ${result.source} – Pool: ${result.pool}\nLP: ${result.lp.toFixed(2)} SOL | Fee: ${result.creator_fee.toFixed(2)}% | Slippage: ${result.slippage.toFixed(2)}%`
  };

  try {
    const res = await fetch(discordWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordMessage)
    });
    if (!res.ok) {
      console.error(`Discord-webhook svarade med fel: ${res.status} ${res.statusText}`);
    } else {
      console.log(`📨 Discord-logg skickad: ${result.status} – ${result.pool}`);
    }
  } catch (err) {
    console.error('Failed to log to Discord:', err);
  }
}

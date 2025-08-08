// safetyService.ts (utvecklingsläge)
// SafetyService v1 – snabb rug check + loggning till Discord och lokal JSONL-fil

import fs from 'fs';
import fetch from 'node-fetch';

const DISCORD_WEBHOOK_URL: string = process.env.DISCORD_WEBHOOK_URL || '';
const LOG_FILE = './logs/safety_checks.jsonl';

interface PoolData {
  address: string;
  mint: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  lpSol: number;
  creatorFee: number;
  estimatedSlippage: number;
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
}

const BLACKLIST = new Set<string>([
  'mintAddress1',
  'mintAddress2'
]);

export async function checkPoolSafety(pool: PoolData): Promise<SafetyResult> {
  const reasons: string[] = [];
  const start = performance.now();

  // Mint authority
  if (pool.mintAuthority !== null) {
    reasons.push('Mint authority present');
  }

  // Freeze authority
  if (pool.freezeAuthority !== null) {
    reasons.push('Freeze authority present');
  }

  // LP check (utvecklingsläge: sänkt till 2 SOL)
  if (pool.lpSol < 2) {
    reasons.push(`LP too low (${pool.lpSol} SOL)`);
  }

  // Creator fee (utvecklingsläge: höjd till max 10 %)
  if (pool.creatorFee > 10) {
    reasons.push(`Creator fee too high (${pool.creatorFee}%)`);
  }

  // Blacklist check
  if (BLACKLIST.has(pool.mint)) {
    reasons.push('Mint is blacklisted');
  }

  // Slippage check (behåll ≤ 3 % gräns)
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
    reasons
  };

  await logResult(result);
  return result;
}

async function logResult(result: SafetyResult): Promise<void> {
  if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs', { recursive: true });
  }

  fs.appendFileSync(LOG_FILE, JSON.stringify(result) + '\n');

  if (!DISCORD_WEBHOOK_URL) {
    console.warn('No Discord webhook URL provided, skipping Discord log');
    return;
  }

  const discordMessage = {
    content: `${result.status === 'SAFE' ? '✅' : '⛔'} ${result.status} – Pool: ${result.pool}\n\n\`\`\`json\n${JSON.stringify(result, null, 4)}\n\`\`\``
  };

  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordMessage)
    });
  } catch (err) {
    console.error('Failed to log to Discord:', err);
  }
}

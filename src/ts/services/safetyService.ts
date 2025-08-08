// safetyService.js
// SafetyService v1 – snabb rug check + loggning till Discord och lokal JSONL-fil

import fs from 'fs';
import fetch from 'node-fetch';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const LOG_FILE = './logs/safety_checks.jsonl';

// Blacklist – kan laddas från fil eller API
const BLACKLIST = new Set([
  'mintAddress1',
  'mintAddress2'
]);

export async function checkPoolSafety(pool) {
  const reasons = [];
  const start = performance.now();

  // Mint authority
  if (pool.mintAuthority !== null) {
    reasons.push('Mint authority present');
  }

  // Freeze authority
  if (pool.freezeAuthority !== null) {
    reasons.push('Freeze authority present');
  }

  // LP check
  if (pool.lpSol < 20) {
    reasons.push(`LP too low (${pool.lpSol} SOL)`);
  }

  // Creator fee
  if (pool.creatorFee > 5) {
    reasons.push(`Creator fee too high (${pool.creatorFee}%)`);
  }

  // Blacklist check
  if (BLACKLIST.has(pool.mint)) {
    reasons.push('Mint is blacklisted');
  }

  // Slippage check
  if (pool.estimatedSlippage > 3) {
    reasons.push(`Slippage too high (${pool.estimatedSlippage}%)`);
  }

  const status = reasons.length === 0 ? 'SAFE' : 'BLOCKED';
  const latency = Math.round(performance.now() - start);

  const result = {
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

async function logResult(result) {
  // Log to file
  fs.appendFileSync(LOG_FILE, JSON.stringify(result) + '\n');

  // Log to Discord
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

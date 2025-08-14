// src/ts/services/notifyService.ts

import fetch from 'node-fetch';
import fs from 'fs';
import { SafetyResult, PoolData } from './safetyService';

const SAFE_LOG_FILE = './logs/safe_pools.json';
const BLOCK_LOG_FILE = './logs/blocked_pools.jsonl';

/**
 * Sends a simple message to a Discord webhook.
 * @param message The message content to send.
 */
export async function notifyDiscord(message: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    // console.warn('[LOGGING] DISCORD_WEBHOOK_URL not set, skipping notification.');
    return;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
    if (!res.ok) {
      console.error(`[LOGGING] Discord API returned status ${res.status}.`);
    }
  } catch (err) {
    console.error('[LOGGING] Failed to send Discord notification:', err);
  }
}

/**
 * Logs the result for a safe pool to console, file, and Discord.
 * @param result The safety check result for the pool.
 */
export async function logSafePool(result: SafetyResult): Promise<void> {
  // 1. Log to console
  console.log(
    `[RESULT] ✅ SAFE: Pool ${result.pool}. Source: ${result.source}, LP: ${result.lp.toFixed(
      2
    )} SOL, Fee: ${result.creator_fee.toFixed(2)}%`
  );

  // 2. Log to file
  try {
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { recursive: true });
    }
    let safePools: SafetyResult[] = [];
    if (fs.existsSync(SAFE_LOG_FILE)) {
      const fileContent = fs.readFileSync(SAFE_LOG_FILE, 'utf8');
      if (fileContent) {
        safePools = JSON.parse(fileContent);
      }
    }
    safePools.push(result);
    fs.writeFileSync(SAFE_LOG_FILE, JSON.stringify(safePools, null, 2));
  } catch (err) {
    console.error(`[LOGGING] Error writing to safe pools log file ${SAFE_LOG_FILE}:`, err);
  }

  // 3. Notify Discord
  const discordMessage = `✅ **SAFE** – Pool Found\n**Source:** ${result.source}\n**Address:** \`${
    result.pool
  }\`\n**LP:** ${result.lp.toFixed(2)} SOL | **Fee:** ${result.creator_fee.toFixed(
    2
  )}% | **Slippage:** ${result.slippage.toFixed(2)}%`;
  await notifyDiscord(discordMessage);
}

/**
 * Logs the result for a blocked pool to console, file, and Discord.
 * @param result The safety check result for the pool.
 * @param pool The original pool data, needed for the mint address.
 */
export async function logBlockedPool(result: SafetyResult, pool: PoolData): Promise<void> {
  const reasons = result.reasons.join(', ');
  // 1. Log to console
  console.log(`[RESULT] ❌ BLOCKED: Pool ${result.pool}. Reasons: ${reasons}`);

  // 2. Log to file
  try {
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { recursive: true });
    }
    const logEntry = {
      timestamp: result.timestamp,
      pool: pool.address,
      mint: pool.mint,
      reasons: result.reasons,
      source: result.source || 'unknown',
    };
    fs.appendFileSync(BLOCK_LOG_FILE, JSON.stringify(logEntry) + '\n');
  } catch (err) {
    console.error(`[LOGGING] Error writing to blocked pools log file ${BLOCK_LOG_FILE}:`, err);
  }

  // 3. Notify Discord
  const discordMessage = `❌ **BLOCKED** – Pool Ignored\n**Address:** \`${result.pool}\`\n**Reasons:** ${reasons}`;
  await notifyDiscord(discordMessage);
}

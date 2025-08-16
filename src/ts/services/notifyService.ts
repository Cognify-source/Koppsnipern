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
  // 1. Log to console - temporarily silenced for cleaner RPS monitoring
  // console.log(
  //   `[RESULT] ✅ SAFE: Pool ${result.pool.address}. Source: ${result.pool.source}, LP: ${result.pool.lpSol.toFixed(
  //     2
  //   )} SOL, Fee: ${result.pool.creatorFee.toFixed(2)}%`
  // );

  // 2. Log to file
  try {
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { recursive: true });
    }
    let safePools: any[] = [];
    if (fs.existsSync(SAFE_LOG_FILE)) {
      const fileContent = fs.readFileSync(SAFE_LOG_FILE, 'utf8');
      if (fileContent) {
        safePools = JSON.parse(fileContent);
      }
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      pool: result.pool.address,
      status: result.status,
      latency: result.latency,
      lp: result.pool.lpSol,
      creator_fee: result.pool.creatorFee || 0,
      slippage: result.pool.slippage || result.pool.estimatedSlippage || 0,
      reasons: result.reasons,
      source: result.pool.source
    };
    
    safePools.push(logEntry);
    fs.writeFileSync(SAFE_LOG_FILE, JSON.stringify(safePools, null, 2));
  } catch (err) {
    console.error(`[LOGGING] Error writing to safe pools log file ${SAFE_LOG_FILE}:`, err);
  }

  // 3. Notify Discord
  const discordMessage = `✅ **SAFE** – Pool Found\n**Source:** ${result.pool.source}\n**Address:** \`${
    result.pool.address
  }\`\n**LP:** ${result.pool.lpSol.toFixed(2)} SOL | **Fee:** ${result.pool.creatorFee.toFixed(
    2
  )}% | **Slippage:** ${(result.pool.slippage || result.pool.estimatedSlippage || 0).toFixed(2)}%`;
  await notifyDiscord(discordMessage);
}

/**
 * Logs the result for a blocked pool to console, file, and Discord.
 * @param result The safety check result for the pool.
 * @param pool The original pool data, needed for the mint address.
 */
export async function logBlockedPool(result: SafetyResult, pool: PoolData): Promise<void> {
  const reasons = result.reasons.join(', ');
  // 1. Log to console - temporarily silenced for cleaner RPS monitoring
  // console.log(`[RESULT] ❌ BLOCKED: Pool ${result.pool.address}. Reasons: ${reasons}`);

  // 2. Log to file
  try {
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { recursive: true });
    }
    const logEntry = {
      timestamp: new Date().toISOString(),
      pool: result.pool.address,
      mint: result.pool.mint,
      reasons: result.reasons,
      source: result.pool.source,
    };
    fs.appendFileSync(BLOCK_LOG_FILE, JSON.stringify(logEntry) + '\n');
  } catch (err) {
    console.error(`[LOGGING] Error writing to blocked pools log file ${BLOCK_LOG_FILE}:`, err);
  }

  // 3. Notify Discord
  const discordMessage = `❌ **BLOCKED** – Pool Ignored\n**Address:** \`${result.pool.address}\`\n**Reasons:** ${reasons}`;
  await notifyDiscord(discordMessage);
}

// src/ts/index.ts

import * as dotenv from "dotenv";
dotenv.config({ override: true });

import { DexPoolListener } from "./listeners/dexPoolListener";
import { TradeService } from "./services/tradeService";
import { RiskManager } from "./services/riskManager";
import { BundleSender } from "./services/bundleSender";
import { TradePlanner } from "./services/tradePlanner";
import { SafetyService, PoolData } from "./services/safetyService";
import { notifyDiscord, logSafePool, logBlockedPool } from "./services/notifyService";
import { Connection, Keypair } from "@solana/web3.js";
import { jsonInfo2PoolKeys, LiquidityPoolJsonInfo } from "@raydium-io/raydium-sdk";
import fetch from "node-fetch";

const isStub = process.env.USE_STUB_LISTENER === "true";
let allRaydiumPools: LiquidityPoolJsonInfo[] | null = null;

// Helper function to fetch and cache Raydium pool list
async function getAllRaydiumPools(): Promise<LiquidityPoolJsonInfo[]> {
  if (allRaydiumPools) {
    return allRaydiumPools;
  }
  try {
    const response = await fetch('https://api.raydium.io/v2/sdk/liquidity/mainnet.json');
    if (!response.ok) throw new Error(`Failed to fetch Raydium pools: ${response.statusText}`);
    const data = await response.json();
    allRaydiumPools = [...(data.official || []), ...(data.unOfficial || [])];
    console.log(`[ORCHESTRATOR] Successfully fetched and cached ${allRaydiumPools.length} Raydium pools.`);
    return allRaydiumPools;
  } catch (error) {
    console.error("[ORCHESTRATOR] Error fetching Raydium pools:", error);
    return [];
  }
}

async function handleNewPool(
  poolData: PoolData,
  tradeSvc: TradeService,
  planner: TradePlanner,
  safety: SafetyService,
  risk: RiskManager,
  bundleSender: BundleSender
): Promise<void> {
  console.log(`\n[ORCHESTRATOR] Received new pool: ${poolData.address} (${poolData.source})`);

  const safetyResult = await safety.isPoolSafe(poolData);

  if (safetyResult.status === 'BLOCKED') {
    await logBlockedPool(safetyResult, poolData);
    return;
  }

  await logSafePool(safetyResult);

  if (!risk.shouldTrade()) {
    console.error("[ORCHESTRATOR] Risk control prohibits trade at this time.");
    return;
  }

  // --- New logic to find pool keys ---
  const allPools = await getAllRaydiumPools();
  const poolJsonInfo = allPools.find(p => p.id === poolData.address);

  if (!poolJsonInfo) {
    console.error(`[ORCHESTRATOR] Pool ${poolData.address} is safe but not found in Raydium's list. Cannot trade.`);
    return;
  }
  const poolKeys = jsonInfo2PoolKeys(poolJsonInfo);
  // --- End new logic ---

  const tradeSignal = await planner.shouldTrigger(poolData);
  if (!tradeSignal) {
    console.log("[ORCHESTRATOR] No trade signal from planner, skipping.");
    return;
  }

  // Pass the dynamically found poolKeys to the trade service
  const sig = await tradeSvc.executeSwap(poolKeys, tradeSignal.amount);
  console.log(`[ORCHESTRATOR] Trade executed, signature: ${sig}`);

  const sent = await bundleSender.sendBundle({ signature: sig });
  console.log(`[ORCHESTRATOR] Bundle sent: ${sent}`);

  risk.recordTradeOutcome(sent, tradeSignal.amount);
}

async function main(): Promise<void> {
  console.log("🚀 Orchestrator starting", isStub ? "(stub-mode)" : "");

  await notifyDiscord("🤖 Koppsnipern bot is online.");
  await getAllRaydiumPools(); // Pre-fetch pools at startup

  const rpcUrl = process.env.SOLANA_HTTP_RPC_URL || "https://api.devnet.solana.com";
  const keyJson = process.env.PAYER_SECRET_KEY;
  if (!keyJson) {
    throw new Error("PAYER_SECRET_KEY must be set in .env");
  }
  let payer: Keypair;

  try {
    const parsedKey = JSON.parse(keyJson);
    payer = Keypair.fromSecretKey(Uint8Array.from(parsedKey));
  } catch (err) {
    console.error("🚫 Could not parse PAYER_SECRET_KEY:", err);
    throw err;
  }

  const connection = new Connection(rpcUrl, { commitment: "confirmed" });

  const tradeSvc = new TradeService({
    connection,
    payer,
  });

  const planner = new TradePlanner();
  const safety = new SafetyService();

  const risk = new RiskManager({
    precisionWindow: 50,
    precisionThreshold: 0.85,
    dailyPnlThreshold: -0.02,
    maxLatencyMs: 150,
    maxPriceSlippage: 0.20,
    blockhashMaxAgeSec: 90,
  });

  const bundleSender = new BundleSender({
    endpoint: process.env.JITO_ENDPOINT!,
    authToken: process.env.JITO_AUTH!,
  });

  const listener = new DexPoolListener(async (poolData: PoolData) => {
    await handleNewPool(poolData, tradeSvc, planner, safety, risk, bundleSender);
  });

  await listener.start();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("⚠️ Fatal error in orchestrator:", err);
    process.exit(1);
  });
}

export { main };

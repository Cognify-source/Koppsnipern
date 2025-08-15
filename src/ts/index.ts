// src/ts/index.ts

import * as dotenv from "dotenv";
dotenv.config({ override: true });

import { DexPoolListener } from "./listeners/dexPoolListener";
import { TradeService } from "./services/trade/tradeService";
import { RiskManager } from "./services/riskManager";
import { BundleSender } from "./services/bundleSender";
import { TradePlanner } from "./services/trade/tradePlanner";
import { SafetyService, PoolData } from "./services/safetyService";
import { notifyDiscord, logSafePool, logBlockedPool } from "./services/notifyService";
import { Connection, Keypair } from "@solana/web3.js";

const isStub = process.env.USE_STUB_LISTENER === "true";

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

  // HARD STOP: Per user request, prevent all trading until detection/logging is perfect.
  console.log('[ORCHESTRATOR] All trading is disabled for this session. Halting execution.');
  return;

  /*
  if (!risk.shouldTrade()) {
    console.error("[ORCHESTRATOR] Risk control prohibits trade at this time.");
    return;
  }

  const tradeSignal = await planner.shouldTrigger(poolData);
  if (!tradeSignal) {
    console.log("[ORCHESTRATOR] No trade signal from planner, skipping.");
    return;
  }

  const sig = await tradeSvc.executeSwap(poolData, tradeSignal.amount);
  console.log(`[ORCHESTRATOR] Trade executed, signature: ${sig}`);

  const sent = await bundleSender.sendBundle({ signature: sig });
  console.log(`[ORCHESTRATOR] Bundle sent: ${sent}`);

  risk.recordTradeOutcome(sent, tradeSignal.amount);
  */
}

async function main(): Promise<void> {
  console.log("🚀 Orchestrator starting", isStub ? "(stub-mode)" : "");
  await notifyDiscord("🤖 Koppsnipern bot is online.");

  const rpcUrl = process.env.SOLANA_HTTP_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, { commitment: "confirmed" });

  const keyJson = process.env.PAYER_SECRET_KEY;
  if (!keyJson) throw new Error("PAYER_SECRET_KEY must be set in .env");
  let payer: Keypair;
  try {
    payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keyJson)));
  } catch (err) {
    console.error("🚫 Could not parse PAYER_SECRET_KEY:", err);
    throw err;
  }

  const tradeSvc = new TradeService({ connection, payer });
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

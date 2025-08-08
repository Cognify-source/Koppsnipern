// src/ts/index.ts

import * as dotenv from "dotenv";
dotenv.config();

import path from "path";
import { StreamListener } from "./services/streamListener";
import { measureLatency } from "./utils/latency";
import { FeatureService } from "./services/featureService";
import { MLService } from "./services/mlService";
import { TradeService } from "./services/tradeService";
import { RiskManager } from "./services/riskManager";
import { BundleSender } from "./services/bundleSender";
import { Connection, Keypair } from "@solana/web3.js";

const isStub = process.env.USE_STUB === "true";

async function handleSlot(
  slot: number,
  featureSvc: FeatureService,
  mlSvc: MLService,
  tradeSvc: TradeService,
  risk: RiskManager,
  mlThreshold: number,
  bundleSender: BundleSender
): Promise<void> {
  console.log(`🕵️‍♂️ Ny slot: ${slot}`);
  const { result: pingOk, latencyMs } = await measureLatency(async () => true);
  console.log(`📶 Ping OK=${pingOk}, latency=${latencyMs}ms`);

  if (isStub) {
    console.log(`📦 Bundle skickad: true`);
    return;
  }

  const rawEvent = { /* ersätts senare med riktig Geyser-event */ };
  const features = featureSvc.extract(rawEvent);
  const score = mlSvc.predict(features);
  risk.recordLatency(latencyMs);
  risk.recordBlockhashTimestamp();
  risk.recordPrices(0, 0);
  risk.recordDailyPnl(0);

  if (!risk.shouldTrade()) {
    console.error("🚫 Riskkontroll misslyckades, avbryter.");
    return;
  }

  if (score >= mlThreshold) {
    const sig = await tradeSvc.executeSwap(0.1);
    console.log(`✅ Trade exekverad, signature: ${sig}`);
    const sent = await bundleSender.sendBundle({ signature: sig });
    console.log(`📦 Bundle skickad: ${sent}`);
    risk.recordTradeOutcome(true, 0.1);
  } else {
    console.log("⚠️ Score under threshold, ingen trade");
    risk.recordTradeOutcome(false, 0);
  }
}

async function main(): Promise<void> {
  console.log("🚀 Orchestrator startar", isStub ? "(stub-mode)" : "");

  if (isStub) {
    const slots: number[] = JSON.parse(process.env.STUB_SLOTS || "[]");
    for (const slot of slots) {
      await handleSlot(slot, {} as any, {} as any, {} as any, {} as any, 0, {} as any);
    }
    return;
  }

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const mlThreshold = parseFloat(process.env.ML_THRESHOLD ?? "0.5");

  const keyJson = process.env.PAYER_SECRET_KEY!;
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keyJson)));

  const connection = new Connection(rpcUrl, { commitment: "confirmed" });

  const featureSvc = new FeatureService({
    pythonPath: process.env.PYTHON_PATH || "python3",
    scriptPath: process.env.FEATURE_SCRIPT ? path.resolve(process.cwd(), process.env.FEATURE_SCRIPT) : undefined,
  });

  const mlSvc = new MLService({
    pythonPath: process.env.PYTHON_PATH || "python3",
    scriptPath: process.env.ML_SCRIPT ? path.resolve(process.cwd(), process.env.ML_SCRIPT) : undefined,
  });

  const poolJson = process.env.TRADE_POOL_JSON ? JSON.parse(process.env.TRADE_POOL_JSON) : {};
  const tradeSvc = new TradeService({ connection, payer, poolJson });

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

  const listener = new StreamListener(rpcUrl, async (slot: number) => {
    await handleSlot(slot, featureSvc, mlSvc, tradeSvc, risk, mlThreshold, bundleSender);
  });

  await listener.start();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("⚠️ Fatal error i orchestrator:", err);
    process.exit(1);
  });
}

export { main };

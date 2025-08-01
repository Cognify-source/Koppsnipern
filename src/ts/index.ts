// src/ts/index.ts

import path from "path";
import { Connection, Keypair } from "@solana/web3.js";
import { StreamListener } from "./services/streamListener";
import { measureLatency } from "./utils/latency";
import { FeatureService } from "./services/featureService";
import { MLService } from "./services/mlService";
import { TradeService } from "./services/tradeService";
import { RiskManager } from "./services/riskManager";

const isStub = process.env.USE_STUB === "true";

async function handleSlot(
  slot: number,
  featureSvc: FeatureService,
  mlSvc: MLService,
  tradeSvc: TradeService,
  risk: RiskManager,
  mlThreshold: number
): Promise<void> {
  console.log(`🕵️‍♂️ Ny slot: ${slot}`);

  const { result: pingOk, latencyMs } = await measureLatency(
    async () => true
  );
  console.log(`📶 Ping OK=${pingOk}, latency=${latencyMs}ms`);

  if (isStub) {
    console.log(`📦 Bundle skickad: true`);
    return;
  }

  const rawEvent = {
    initial_lp: 100,
    burned_amount: 5,
    mint_authority_burned: true,
    init_timestamp: Date.now() / 1000,
    extract_timestamp: Date.now() / 1000,
    actions: [],
  };
  const features = featureSvc.extract(rawEvent);
  console.log("🔧 Features:", features);

  const score = mlSvc.predict(features);
  console.log(`🤖 ML-score: ${score.toFixed(3)}`);

  risk.recordLatency(latencyMs);
  risk.recordBlockhashTimestamp();
  risk.recordPrices(0, 0);
  risk.recordDailyPnl(0);

  if (!risk.shouldTrade()) {
    console.error("🚫 Riskkontroll misslyckades, avbryter.");
    return;
  }

  if (score >= mlThreshold) {
    console.log(`💸 Exekverar swap: 0.1 SOL`);
    const sig = await tradeSvc.executeSwap(0.1);
    console.log(`✅ Trade exekverad, signature: ${sig}`);
    risk.recordTradeOutcome(true, 0.1);
  } else {
    console.log("⚠️ Score under threshold, ingen trade");
    risk.recordTradeOutcome(false, 0);
  }
}

async function main(): Promise<void> {
  console.log("🚀 Orchestrator startar", isStub ? "(stub-mode)" : "");

  const rpcUrl =
    process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const mlThreshold = parseFloat(process.env.ML_THRESHOLD ?? "0.5");

  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.PAYER_SECRET_KEY!))
  );

  const connection = new Connection(rpcUrl, {
    commitment: "confirmed",
  });

  const featureSvc = new FeatureService({
    pythonPath: process.env.PYTHON_PATH || "python3",
    scriptPath: process.env.FEATURE_SCRIPT
      ? path.resolve(process.cwd(), process.env.FEATURE_SCRIPT)
      : undefined,
  });

  const mlSvc = new MLService({
    pythonPath: process.env.PYTHON_PATH || "python3",
    scriptPath: process.env.ML_SCRIPT
      ? path.resolve(process.cwd(), process.env.ML_SCRIPT)
      : undefined,
  });

  const tradeSvc = new TradeService({
    connection,
    payer,
    poolJson: JSON.parse(process.env.TRADE_POOL_JSON!),
  });

  const risk = new RiskManager({
    precisionWindow: 50,
    precisionThreshold: 0.85,
    dailyPnlThreshold: -0.02,
    maxLatencyMs: 150,
    maxPriceSlippage: 0.20,
    blockhashMaxAgeSec: 90,
  });

  if (isStub) {
    const slots: number[] = JSON.parse(process.env.STUB_SLOTS || "[]");
    for (const slot of slots) {
      await handleSlot(
        slot,
        featureSvc,
        mlSvc,
        tradeSvc,
        risk,
        mlThreshold
      );
    }
    return;
  }

  const listener = new StreamListener(
    rpcUrl,
    async (slot: number) => {
      await handleSlot(
        slot,
        featureSvc,
        mlSvc,
        tradeSvc,
        risk,
        mlThreshold
      );
    }
  );
  await listener.start();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("⚠️ Fatal error i orchestrator:", err);
    process.exit(1);
  });
}

export { main };

// src/ts/index.ts

import path from "path";
import { StreamListener } from "./services/streamListener";
import { measureLatency } from "./utils/latency";
import { FeatureService } from "./services/featureService";
import { MLService } from "./services/mlService";
import { BundleSender } from "./services/bundleSender";
import { RiskManager } from "./services/riskManager";

async function handleSlot(
  slot: number,
  featureSvc: FeatureService,
  mlSvc: MLService,
  risk: RiskManager,
  mlThreshold: number
): Promise<void> {
  console.log(`🕵️‍♂️ Ny slot: ${slot}`);

  // 1) Feature-extraktion (stub-event)
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

  // 2) ML-prediktion
  const score = mlSvc.predict(features);
  console.log(`🤖 ML-score: ${score.toFixed(3)}`);

  // 3) Latency & riskkontroller
  const { result: pingOk, latencyMs } = await measureLatency(async () => true);
  console.log(`📶 Ping OK=${pingOk}, latency=${latencyMs}ms`);

  risk.recordLatency(latencyMs);
  risk.recordBlockhashTimestamp();
  risk.recordPrices(0, 0);
  risk.recordDailyPnl(0);

  if (!risk.shouldTrade()) {
    console.error("🚫 Riskkontroll misslyckades, avbryter.");
    return;
  }

  // 4) Beslut & bundle-sändning
  if (score >= mlThreshold) {
    const sender = new BundleSender({
      endpoint:
        process.env.JITO_ENDPOINT || "https://postman-echo.com/post",
      authToken: process.env.JITO_AUTH_TOKEN || "uuid-1234",
    });
    const sent = await sender.sendBundle({ slot, dummy: true });
    console.log(`📦 Bundle skickad: ${sent}`);
  } else {
    console.log("⚠️ Score under threshold, avbryter.");
  }
}

async function main(): Promise<void> {
  console.log("🚀 Orchestrator startar med ML...");

  const mlThreshold = parseFloat(process.env.ML_THRESHOLD ?? "0.5");
  const pythonPath = process.env.PYTHON_PATH || "python3";
  const featureScript = process.env.FEATURE_SCRIPT
    ? path.resolve(process.cwd(), process.env.FEATURE_SCRIPT)
    : undefined;
  const mlScript = process.env.ML_SCRIPT
    ? path.resolve(process.cwd(), process.env.ML_SCRIPT)
    : undefined;

  const featureSvc = new FeatureService({
    pythonPath,
    scriptPath: featureScript,
  });
  const mlSvc = new MLService({
    pythonPath,
    scriptPath: mlScript,
  });
  const risk = new RiskManager({
    precisionWindow: 50,
    precisionThreshold: 0.85,
    dailyPnlThreshold: -0.02,
    maxLatencyMs: 150,
    maxPriceSlippage: 0.20,
    blockhashMaxAgeSec: 90,
  });

  // Om vi kör i stub-mode (för integrationstest), matas slots från env
  if (process.env.USE_STUB === "true") {
    const slots: number[] = JSON.parse(process.env.STUB_SLOTS || "[]");
    for (const slot of slots) {
      await handleSlot(slot, featureSvc, mlSvc, risk, mlThreshold);
    }
    return;
  }

  // Annars kör vi mot riktig Solana-websocket
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const listener = new StreamListener(rpcUrl, async (slot: number) => {
    await handleSlot(slot, featureSvc, mlSvc, risk, mlThreshold);
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

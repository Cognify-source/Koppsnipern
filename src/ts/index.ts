// src/ts/index.ts

import * as dotenv from "dotenv";
dotenv.config();  // ===> laddar .env in i process.env

import path from "path";
import { StreamListener } from "./services/streamListener";
import { measureLatency } from "./utils/latency";
import { FeatureService } from "./services/featureService";
import { MLService } from "./services/mlService";
import { TradeService } from "./services/tradeService";
import { RiskManager } from "./services/riskManager";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

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
  const { result: pingOk, latencyMs } = await measureLatency(async () => true);
  console.log(`📶 Ping OK=${pingOk}, latency=${latencyMs}ms`);

  if (isStub) {
    // stub-mode: bara logga bundle-bekräftelse
    console.log(`📦 Bundle skickad: true`);
    return;
  }

  // ... resten av ML → risk → TradeService.executeSwap(0.1) …
  const rawEvent = { /* … */ };
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

  // Om stub-mode: kör stub-slots och avsluta direkt
  if (isStub) {
    const slots: number[] = JSON.parse(process.env.STUB_SLOTS || "[]");
    for (const slot of slots) {
      // dummy-services skickar bara loggar i handleSlot
      await handleSlot(
        slot,
        {} as any, // featureSvc – används inte i stub
        {} as any, // mlSvc      – används inte i stub
        {} as any, // tradeSvc   – används inte i stub
        {} as any, // risk       – används inte i stub
        0
      );
    }
    return;
  }

  // ——— Resten kräver riktiga keypairs och poolJson ———
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const mlThreshold = parseFloat(process.env.ML_THRESHOLD ?? "0.5");

  // Payer‐setup (kräver att PAYER_SECRET_KEY är en JSON-array)
  const keyJson = process.env.PAYER_SECRET_KEY!;
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keyJson)));

  const connection = new Connection(rpcUrl, { commitment: "confirmed" });
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

  // poolJson måste sättas i env för Devnet-testet
  const poolJson = process.env.TRADE_POOL_JSON
    ? JSON.parse(process.env.TRADE_POOL_JSON)
    : {};
  const tradeSvc = new TradeService({ connection, payer, poolJson });

  const risk = new RiskManager({
    precisionWindow: 50,
    precisionThreshold: 0.85,
    dailyPnlThreshold: -0.02,
    maxLatencyMs: 150,
    maxPriceSlippage: 0.20,
    blockhashMaxAgeSec: 90,
  });

  // Riktig WebSocket-loop
  const listener = new StreamListener(rpcUrl, async (slot: number) => {
    await handleSlot(slot, featureSvc, mlSvc, tradeSvc, risk, mlThreshold);
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

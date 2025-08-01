// src/ts/index.ts

import path from "path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { StreamListener } from "./services/streamListener";
import { measureLatency } from "./utils/latency";
import { FeatureService } from "./services/featureService";
import { MLService } from "./services/mlService";
import { TradeService } from "./services/tradeService";
import { RiskManager } from "./services/riskManager";

async function main(): Promise<void> {
  console.log("🚀 Orchestrator startar med TradePipeline...");

  // Konfiguration
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const mlThreshold = parseFloat(process.env.ML_THRESHOLD ?? "0.5");
  const secretKey = process.env.PAYER_SECRET_KEY!; // Base58 eller JSON-array
  const recipientAddr = process.env.TRADE_RECIPIENT!; // t.ex. din destination

  // Initiera Solana-anslutning och Keypair
  const connection = new Connection(rpcUrl, { commitment: "confirmed" });
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(secretKey))
  );
  const recipient = new PublicKey(recipientAddr);

  // Initiera dina services
  const featureSvc = new FeatureService({ pythonPath: "python3" });
  const mlSvc = new MLService({ pythonPath: "python3" });
  const tradeSvc = new TradeService({ connection, payer });
  const risk = new RiskManager({
    precisionWindow: 50,
    precisionThreshold: 0.85,
    dailyPnlThreshold: -0.02,
    maxLatencyMs: 150,
    maxPriceSlippage: 0.20,
    blockhashMaxAgeSec: 90,
  });

  // Lyssna på slots
  const listener = new StreamListener(rpcUrl, async (slot: number) => {
    console.log(`🕵️‍♂️ Slot: ${slot}`);

    // --- Features & ML ---
    const rawEvent = { /* hämta ditt event här */ };
    const features = featureSvc.extract(rawEvent);
    const score = mlSvc.predict(features);
    console.log(`🤖 ML-score: ${score.toFixed(3)}`);

    // --- Latency & Risk ---
    const { latencyMs } = await measureLatency(async () => true);
    risk.recordLatency(latencyMs);
    risk.recordBlockhashTimestamp();
    risk.recordPrices(0, 0);
    risk.recordDailyPnl(0);

    if (!risk.shouldTrade()) {
      console.warn("🚫 Riskkontroll stoppade handeln");
      return;
    }

    // --- Trade-beslut ---
    if (score >= mlThreshold) {
      console.log(`💸 Exekverar swap: 0.1 SOL → ${recipient.toBase58()}`);
      const sig = await tradeSvc.executeSwap(recipient, 0.1);
      console.log(`✅ Traded, signature: ${sig}`);
      risk.recordTradeOutcome(true, 0.1); 
    } else {
      console.log("⚠️ Score under threshold, ingen trade");
      risk.recordTradeOutcome(false, 0);
    }
  });

  await listener.start();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { main };

// src/ts/index.ts

import * as dotenv from "dotenv";
dotenv.config();

import { StreamListener } from "./services/streamListener";
import { TradeService } from "./services/tradeService";
import { RiskManager } from "./services/riskManager";
import { BundleSender } from "./services/bundleSender";
import { TradePlanner } from "./services/tradePlanner";
import { SafetyService } from "./services/safetyService";
import { notifyDiscord } from "./services/notifyService";
import { Connection, Keypair } from "@solana/web3.js";

const isStub = process.env.USE_STUB === "true";

async function handleSlot(
  slot: number,
  tradeSvc: TradeService,
  planner: TradePlanner,
  safety: SafetyService,
  risk: RiskManager,
  bundleSender: BundleSender
): Promise<void> {
  console.log(`🕵️‍♂️ Ny slot: ${slot}`);

  const poolEvent = {}; // TODO: Hämta riktig Geyser-event

  if (!safety.isPoolSafe(poolEvent)) {
    console.log("⚠️ Poolen underkänd i safety checks");
    return;
  }

  if (!risk.shouldTrade()) {
    console.error("🚫 Riskkontroll misslyckades, avbryter.");
    return;
  }

  const tradeSignal = await planner.shouldTrigger(poolEvent);
  if (!tradeSignal) {
    console.log("⏳ Inväntar trigger...");
    return;
  }

  const sig = await tradeSvc.executeSwap(tradeSignal.amount);
  console.log(`✅ Trade exekverad, signature: ${sig}`);

  const sent = await bundleSender.sendBundle({ signature: sig });
  console.log(`📦 Bundle skickad: ${sent}`);

  risk.recordTradeOutcome(sent, tradeSignal.amount);
}

async function main(): Promise<void> {
  console.log("🚀 Orchestrator startar", isStub ? "(stub-mode)" : "");

  await notifyDiscord("🤖 Koppsnipern är online");

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const keyJson = process.env.PAYER_SECRET_KEY!;
  console.log("🧪 keyJson-innehåll:", keyJson);
  let payer: Keypair;

  try {
    const parsedKey = JSON.parse(keyJson);
    payer = Keypair.fromSecretKey(Uint8Array.from(parsedKey));
  } catch (err) {
    console.error("🚫 Kunde inte parsa PAYER_SECRET_KEY:", keyJson);
    throw err;
  }

  const connection = new Connection(rpcUrl, { commitment: "confirmed" });

  const tradeSvc = new TradeService({
    connection,
    payer,
    poolJson: process.env.TRADE_POOL_JSON ? JSON.parse(process.env.TRADE_POOL_JSON) : {},
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

  const listener = new StreamListener(rpcUrl, async (slot: number) => {
    await handleSlot(slot, tradeSvc, planner, safety, risk, bundleSender);
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

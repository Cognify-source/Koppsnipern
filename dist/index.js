"use strict";
// src/ts/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const web3_js_1 = require("@solana/web3.js");
const streamListener_1 = require("./services/streamListener");
const latency_1 = require("./utils/latency");
const featureService_1 = require("./services/featureService");
const mlService_1 = require("./services/mlService");
const tradeService_1 = require("./services/tradeService");
const riskManager_1 = require("./services/riskManager");
async function main() {
    console.log("🚀 Orchestrator startar med TradePipeline...");
    // Konfiguration
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const mlThreshold = parseFloat(process.env.ML_THRESHOLD ?? "0.5");
    const secretKey = process.env.PAYER_SECRET_KEY; // Base58 eller JSON-array
    const recipientAddr = process.env.TRADE_RECIPIENT; // t.ex. din destination
    // Initiera Solana-anslutning och Keypair
    const connection = new web3_js_1.Connection(rpcUrl, { commitment: "confirmed" });
    const payer = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
    const recipient = new web3_js_1.PublicKey(recipientAddr);
    // Initiera dina services
    const featureSvc = new featureService_1.FeatureService({ pythonPath: "python3" });
    const mlSvc = new mlService_1.MLService({ pythonPath: "python3" });
    const tradeSvc = new tradeService_1.TradeService({ connection, payer });
    const risk = new riskManager_1.RiskManager({
        precisionWindow: 50,
        precisionThreshold: 0.85,
        dailyPnlThreshold: -0.02,
        maxLatencyMs: 150,
        maxPriceSlippage: 0.20,
        blockhashMaxAgeSec: 90,
    });
    // Lyssna på slots
    const listener = new streamListener_1.StreamListener(rpcUrl, async (slot) => {
        console.log(`🕵️‍♂️ Slot: ${slot}`);
        // --- Features & ML ---
        const rawEvent = { /* hämta ditt event här */};
        const features = featureSvc.extract(rawEvent);
        const score = mlSvc.predict(features);
        console.log(`🤖 ML-score: ${score.toFixed(3)}`);
        // --- Latency & Risk ---
        const { latencyMs } = await (0, latency_1.measureLatency)(async () => true);
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
        }
        else {
            console.log("⚠️ Score under threshold, ingen trade");
            risk.recordTradeOutcome(false, 0);
        }
    });
    await listener.start();
}
exports.main = main;
if (require.main === module) {
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}

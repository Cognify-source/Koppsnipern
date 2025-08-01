"use strict";
// src/ts/index.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const path_1 = __importDefault(require("path"));
const web3_js_1 = require("@solana/web3.js");
const streamListener_1 = require("./services/streamListener");
const latency_1 = require("./utils/latency");
const featureService_1 = require("./services/featureService");
const mlService_1 = require("./services/mlService");
const tradeService_1 = require("./services/tradeService");
const riskManager_1 = require("./services/riskManager");
const isStub = process.env.USE_STUB === "true";
async function handleSlot(slot, featureSvc, mlSvc, tradeSvc, risk, mlThreshold) {
    console.log(`🕵️‍♂️ Ny slot: ${slot}`);
    const { result: pingOk, latencyMs } = await (0, latency_1.measureLatency)(async () => true);
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
    }
    else {
        console.log("⚠️ Score under threshold, ingen trade");
        risk.recordTradeOutcome(false, 0);
    }
}
async function main() {
    var _a;
    console.log("🚀 Orchestrator startar", isStub ? "(stub-mode)" : "");
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const mlThreshold = parseFloat((_a = process.env.ML_THRESHOLD) !== null && _a !== void 0 ? _a : "0.5");
    const payer = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.PAYER_SECRET_KEY)));
    const connection = new web3_js_1.Connection(rpcUrl, {
        commitment: "confirmed",
    });
    const featureSvc = new featureService_1.FeatureService({
        pythonPath: process.env.PYTHON_PATH || "python3",
        scriptPath: process.env.FEATURE_SCRIPT
            ? path_1.default.resolve(process.cwd(), process.env.FEATURE_SCRIPT)
            : undefined,
    });
    const mlSvc = new mlService_1.MLService({
        pythonPath: process.env.PYTHON_PATH || "python3",
        scriptPath: process.env.ML_SCRIPT
            ? path_1.default.resolve(process.cwd(), process.env.ML_SCRIPT)
            : undefined,
    });
    const tradeSvc = new tradeService_1.TradeService({
        connection,
        payer,
        poolJson: JSON.parse(process.env.TRADE_POOL_JSON),
    });
    const risk = new riskManager_1.RiskManager({
        precisionWindow: 50,
        precisionThreshold: 0.85,
        dailyPnlThreshold: -0.02,
        maxLatencyMs: 150,
        maxPriceSlippage: 0.20,
        blockhashMaxAgeSec: 90,
    });
    if (isStub) {
        const slots = JSON.parse(process.env.STUB_SLOTS || "[]");
        for (const slot of slots) {
            await handleSlot(slot, featureSvc, mlSvc, tradeSvc, risk, mlThreshold);
        }
        return;
    }
    const listener = new streamListener_1.StreamListener(rpcUrl, async (slot) => {
        await handleSlot(slot, featureSvc, mlSvc, tradeSvc, risk, mlThreshold);
    });
    await listener.start();
}
exports.main = main;
if (require.main === module) {
    main().catch((err) => {
        console.error("⚠️ Fatal error i orchestrator:", err);
        process.exit(1);
    });
}

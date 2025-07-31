"use strict";
// src/ts/index.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const path_1 = __importDefault(require("path"));
const streamListener_1 = require("./services/streamListener");
const latency_1 = require("./utils/latency");
const bundleSender_1 = require("./services/bundleSender");
const mlService_1 = require("./services/mlService");
async function main() {
    console.log("🚀 Orchestrator startar med ML...");
    // Hämta threshold från miljö eller defaultera till 0.5
    const mlThreshold = parseFloat(process.env.ML_THRESHOLD ?? "0.5");
    // Initiera ML-servicen
    const ml = new mlService_1.MLService({
        pythonPath: process.env.PYTHON_PATH || "python3",
        scriptPath: process.env.ML_SCRIPT
            ? path_1.default.resolve(process.cwd(), process.env.ML_SCRIPT)
            : undefined,
    });
    // Sätt upp WebSocket-lyssnaren
    const listener = new streamListener_1.StreamListener(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", async (slot) => {
        console.log(`🕵️‍♂️ Ny slot: ${slot}`);
        // 1) Mät RTT (stub)
        const { result: pingOk, latencyMs } = await (0, latency_1.measureLatency)(async () => true);
        console.log(`📶 Ping OK=${pingOk}, latency=${latencyMs}ms`);
        // 2) Dummy-features för ML
        const features = {
            lp_size: 100,
            initial_burn: 5,
            mint_authority_burned: 1,
            time_since_init: 1.2,
            early_buy_count: 0,
            early_sell_count: 0,
            early_buy_sell_ratio: 0,
        };
        // 3) Hämta ML-score
        const score = ml.predict(features);
        console.log(`🤖 ML-score: ${score.toFixed(3)}`);
        // 4) Beslut & bundle-sändning
        if (score >= mlThreshold) {
            const sender = new bundleSender_1.BundleSender({
                endpoint: process.env.JITO_ENDPOINT || "https://postman-echo.com/post",
                authToken: process.env.JITO_AUTH_TOKEN || "uuid-1234",
            });
            const sent = await sender.sendBundle({ slot, dummy: true });
            console.log(`📦 Bundle skickad: ${sent}`);
        }
        else {
            console.log("⚠️ Score under threshold, avbryter.");
        }
    });
    // Starta prenumerationen
    await listener.start();
}
exports.main = main;
// Endast kör main om filen anropas direkt
if (require.main === module) {
    main().catch((err) => {
        console.error("⚠️ Fatal error i orchestrator:", err);
        process.exit(1);
    });
}

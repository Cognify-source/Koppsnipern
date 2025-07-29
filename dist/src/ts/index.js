"use strict";
// src/ts/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
const streamListener_1 = require("./services/streamListener");
const latency_1 = require("./utils/latency");
const bundleSender_1 = require("./services/bundleSender");
async function main() {
    // 1) Starta listener
    const listener = new streamListener_1.StreamListener("https://your-chainstack-endpoint", async (slot) => {
        console.log(`Ny slot: ${slot}`);
        // 2) Mät RTT mot Jito-endpoint (stub)
        const { result: pingOk, latencyMs } = await (0, latency_1.measureLatency)(async () => {
            // Här kan du köra en liten fetch mot Jito eller annan stub
            return true;
        });
        console.log(`Ping OK=${pingOk}, latency=${latencyMs}ms`);
        // 3) Skicka ett dummy-bundle
        const sender = new bundleSender_1.BundleSender({
            endpoint: "https://jito.example/sendBundle",
            authToken: "uuid-1234",
        });
        const sent = await sender.sendBundle({ slot, dummy: true });
        console.log(`Bundle skickad: ${sent}`);
    });
    await listener.start(500);
}
if (require.main === module) {
    main().catch((err) => {
        console.error("Fatal error i main:", err);
        process.exit(1);
    });
}

"use strict";
// src/ts/services/streamListener.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamListener = void 0;
const web3_js_1 = require("@solana/web3.js");
/**
 * StreamListener-klass som ansluter mot en Solana RPC via gRPC-plugin
 * (t.ex. Chainstack Yellowstone) och anropar callback för varje slot.
 */
class StreamListener {
    constructor(rpcUrl, onSlot) {
        this.connection = new web3_js_1.Connection(rpcUrl, { commitment: "confirmed" });
        this.onSlot = onSlot;
    }
    /**
     * Startar en enkel polling av senaste slot var X ms.
     * (Senare byter vi till riktiga gRPC-streams när plugin fungerar.)
     */
    async start(pollIntervalMs = 500) {
        let lastSlot = await this.connection.getSlot("confirmed");
        // Anropa callback direkt på första slot
        this.onSlot(lastSlot);
        // Poll-loop
        setInterval(async () => {
            try {
                const slot = await this.connection.getSlot("confirmed");
                if (slot > lastSlot) {
                    lastSlot = slot;
                    this.onSlot(slot);
                }
            }
            catch (err) {
                console.error("StreamListener error:", err);
            }
        }, pollIntervalMs);
    }
}
exports.StreamListener = StreamListener;

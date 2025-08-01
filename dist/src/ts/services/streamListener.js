"use strict";
// src/ts/services/streamListener.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamListener = void 0;
const web3_js_1 = require("@solana/web3.js");
/**
 * StreamListener-klass som ansluter mot en Solana RPC via WebSocket
 * och anropar callback för varje nytt slot.
 */
class StreamListener {
    constructor(rpcUrl, onSlot) {
        this.connection = new web3_js_1.Connection(rpcUrl, { commitment: "confirmed" });
        this.onSlot = onSlot;
    }
    /**
     * Startar WebSocket-prenumeration på slot-ändringar.
     * @returns prenumerations-ID som kan användas för att avbryta.
     */
    async start() {
        const subId = this.connection.onSlotChange((slotInfo) => {
            const slot = typeof slotInfo === "number" ? slotInfo : slotInfo.slot;
            this.onSlot(slot);
        });
        this.subscriptionId = subId;
        return subId;
    }
    /**
     * Stoppar WebSocket-prenumerationen.
     */
    stop() {
        if (this.subscriptionId !== undefined) {
            this.connection.removeSlotChangeListener(this.subscriptionId);
        }
    }
}
exports.StreamListener = StreamListener;

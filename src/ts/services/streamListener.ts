// src/ts/services/streamListener.ts

import { Connection } from "@solana/web3.js";

/**
 * StreamListener-klass som ansluter mot en Solana RPC via gRPC-plugin
 * (t.ex. Chainstack Yellowstone) och anropar callback för varje slot.
 */
export class StreamListener {
  private connection: Connection;
  private onSlot: (slot: number) => void;

  constructor(rpcUrl: string, onSlot: (slot: number) => void) {
    this.connection = new Connection(rpcUrl, { commitment: "confirmed" });
    this.onSlot = onSlot;
  }

  /**
   * Startar en enkel polling av senaste slot var X ms.
   * (Senare byter vi till riktiga gRPC-streams när plugin fungerar.)
   */
  async start(pollIntervalMs = 500): Promise<void> {
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
      } catch (err) {
        console.error("StreamListener error:", err);
      }
    }, pollIntervalMs);
  }
}

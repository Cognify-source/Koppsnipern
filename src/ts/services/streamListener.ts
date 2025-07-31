// src/ts/services/streamListener.ts

import { Connection } from "@solana/web3.js";

/**
 * StreamListener-klass som ansluter mot en Solana RPC via WebSocket
 * och anropar callback för varje nytt slot.
 */
export class StreamListener {
  private connection: Connection;
  private onSlot: (slot: number) => void;
  private subscriptionId?: number;

  constructor(rpcUrl: string, onSlot: (slot: number) => void) {
    this.connection = new Connection(rpcUrl, { commitment: "confirmed" });
    this.onSlot = onSlot;
  }

  /**
   * Startar WebSocket-prenumeration på slot-ändringar.
   * @returns prenumerations-ID som kan användas för att avbryta.
   */
  async start(): Promise<number> {
    const subId = this.connection.onSlotChange((slotInfo: any) => {
      const slot = typeof slotInfo === "number" ? slotInfo : slotInfo.slot;
      this.onSlot(slot);
    });
    this.subscriptionId = subId;
    return subId;
  }

  /**
   * Stoppar WebSocket-prenumerationen.
   */
  stop(): void {
    if (this.subscriptionId !== undefined) {
      this.connection.removeSlotChangeListener(this.subscriptionId);
    }
  }
}

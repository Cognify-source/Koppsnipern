import { Connection, Keypair } from "@solana/web3.js";
import { TradeServicePumpV1 } from "./tradeServicePumpV1";

class TradeOrchestrator {
  constructor(private connection: Connection, private payer: Keypair) {}

  getService(poolSource: string) {
    switch(poolSource) {
      case 'PumpV1': return new TradeServicePumpV1({ connection: this.connection, payer: this.payer });
      // Launchlab och Meteora läggs till senare
      default: throw new Error(`Unsupported pool source: ${poolSource}`);
    }
  }
}

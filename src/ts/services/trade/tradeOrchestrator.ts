class TradeOrchestrator {
  constructor(private connection: Connection, private payer: Keypair) {}

  getService(poolSource: string) {
    switch(poolSource) {
      case 'PumpV1': return new PumpV1TradeService({ connection: this.connection, payer: this.payer });
      case 'PumpAMM': return new PumpAmmTradeService({ connection: this.connection, payer: this.payer });
      // Launchlab och Meteora läggs till senare
      default: throw new Error(`Unsupported pool source: ${poolSource}`);
    }
  }
}

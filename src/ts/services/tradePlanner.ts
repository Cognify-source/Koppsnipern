// src/ts/services/tradePlanner.ts

export interface TradeSignal {
  amount: number;
}

export class TradePlanner {
  constructor() {
    // Init-logik om det behövs
  }

  async shouldTrigger(poolEvent: any): Promise<TradeSignal | null> {
    // TODO: implementera riktig triggerlogik baserat på t.ex. Cupsyy-detektion
    const triggered = true;
    return triggered ? { amount: 2 } : null;
  }
}

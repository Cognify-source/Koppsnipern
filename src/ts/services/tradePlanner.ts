// src/ts/services/tradePlanner.ts

export interface TradeSignal {
  amount: number;
}

export class TradePlanner {
  constructor() {}

  async shouldTrigger(poolEvent: any): Promise<TradeSignal | null> {
    // TODO: riktig logik baserat på Cupsyy-trigger
    const triggered = true;
    return triggered ? { amount: 2 } : null;
  }
}
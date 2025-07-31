// src/ts/services/riskManager.ts

export interface RiskManagerOptions {
  precisionWindow: number;      // antal trades att rulla precision över
  precisionThreshold: number;   // minimiprecision (t.ex. 0.85)
  dailyPnlThreshold: number;    // minst tillåten dags-PnL i decimalform (t.ex. -0.02)
  maxLatencyMs: number;         // max RTT i ms (t.ex. 150)
  maxPriceSlippage: number;     // max prisökning (t.ex. 0.20 för 20%)
  blockhashMaxAgeSec: number;   // max blockhash-ålder i sekunder (t.ex. 90)
}

export class RiskManager {
  private opts: RiskManagerOptions;
  private recentTrades: boolean[] = [];
  private dailyPnlPercent = 0;
  private lastLatencyMs = 0;
  private initPrice?: number;
  private execPrice?: number;
  private blockhashTimestamp = Date.now();

  constructor(opts: RiskManagerOptions) {
    this.opts = opts;
  }

  /**
   * Anropa efter varje trade.
   * @param success – true om trade lyckades, false annars
   * @param profitPercent – avkastning i decimalform (t.ex. 0.01 för +1%), ej använd i nuläget
   */
  recordTradeOutcome(success: boolean, profitPercent: number): void {
    this.recentTrades.push(success);
    if (this.recentTrades.length > this.opts.precisionWindow) {
      this.recentTrades.shift();
    }
  }

  /** Anropa när du uppdaterar dags-P&L (i decimalform, -0.02 = -2%) */
  recordDailyPnl(pnlPercent: number): void {
    this.dailyPnlPercent = pnlPercent;
  }

  /** Anropa efter varje latency-mätning */
  recordLatency(latencyMs: number): void {
    this.lastLatencyMs = latencyMs;
  }

  /** Anropa före och efter en trade för att jämföra pris */
  recordPrices(initPrice: number, execPrice: number): void {
    this.initPrice = initPrice;
    this.execPrice = execPrice;
  }

  /** Anropa när du hämtar ny blockhash */
  recordBlockhashTimestamp(timestampMs = Date.now()): void {
    this.blockhashTimestamp = timestampMs;
  }

  private checkPrecision(): boolean {
    if (this.recentTrades.length < this.opts.precisionWindow) {
      return true;
    }
    const okCount = this.recentTrades.filter((x) => x).length;
    return okCount / this.opts.precisionWindow >= this.opts.precisionThreshold;
  }

  private checkDailyPnl(): boolean {
    return this.dailyPnlPercent >= this.opts.dailyPnlThreshold;
  }

  private checkLatency(): boolean {
    return this.lastLatencyMs <= this.opts.maxLatencyMs;
  }

  private checkPriceSlippage(): boolean {
    if (this.initPrice == null || this.execPrice == null) {
      return true;
    }
    return this.execPrice <= this.initPrice * (1 + this.opts.maxPriceSlippage);
  }

  private checkBlockhashAge(): boolean {
    const ageSec = (Date.now() - this.blockhashTimestamp) / 1000;
    return ageSec <= this.opts.blockhashMaxAgeSec;
  }

  /**
   * Returnerar true om alla riskkontroller är OK.
   */
  shouldTrade(): boolean {
    return (
      this.checkPrecision() &&
      this.checkDailyPnl() &&
      this.checkLatency() &&
      this.checkPriceSlippage() &&
      this.checkBlockhashAge()
    );
  }
}

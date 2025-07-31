"use strict";
// src/ts/services/riskManager.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskManager = void 0;
class RiskManager {
    constructor(opts) {
        this.recentTrades = [];
        this.dailyPnlPercent = 0;
        this.lastLatencyMs = 0;
        this.blockhashTimestamp = Date.now();
        this.opts = opts;
    }
    /**
     * Anropa efter varje trade.
     * @param success – true om trade lyckades, false annars
     * @param profitPercent – avkastning i decimalform (t.ex. 0.01 för +1%), ej använd i nuläget
     */
    recordTradeOutcome(success, profitPercent) {
        this.recentTrades.push(success);
        if (this.recentTrades.length > this.opts.precisionWindow) {
            this.recentTrades.shift();
        }
    }
    /** Anropa när du uppdaterar dags-P&L (i decimalform, -0.02 = -2%) */
    recordDailyPnl(pnlPercent) {
        this.dailyPnlPercent = pnlPercent;
    }
    /** Anropa efter varje latency-mätning */
    recordLatency(latencyMs) {
        this.lastLatencyMs = latencyMs;
    }
    /** Anropa före och efter en trade för att jämföra pris */
    recordPrices(initPrice, execPrice) {
        this.initPrice = initPrice;
        this.execPrice = execPrice;
    }
    /** Anropa när du hämtar ny blockhash */
    recordBlockhashTimestamp(timestampMs = Date.now()) {
        this.blockhashTimestamp = timestampMs;
    }
    checkPrecision() {
        if (this.recentTrades.length < this.opts.precisionWindow) {
            return true;
        }
        const okCount = this.recentTrades.filter((x) => x).length;
        return okCount / this.opts.precisionWindow >= this.opts.precisionThreshold;
    }
    checkDailyPnl() {
        return this.dailyPnlPercent >= this.opts.dailyPnlThreshold;
    }
    checkLatency() {
        return this.lastLatencyMs <= this.opts.maxLatencyMs;
    }
    checkPriceSlippage() {
        if (this.initPrice == null || this.execPrice == null) {
            return true;
        }
        return this.execPrice <= this.initPrice * (1 + this.opts.maxPriceSlippage);
    }
    checkBlockhashAge() {
        const ageSec = (Date.now() - this.blockhashTimestamp) / 1000;
        return ageSec <= this.opts.blockhashMaxAgeSec;
    }
    /**
     * Returnerar true om alla riskkontroller är OK.
     */
    shouldTrade() {
        return (this.checkPrecision() &&
            this.checkDailyPnl() &&
            this.checkLatency() &&
            this.checkPriceSlippage() &&
            this.checkBlockhashAge());
    }
}
exports.RiskManager = RiskManager;

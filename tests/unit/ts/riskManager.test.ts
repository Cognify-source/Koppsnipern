// tests/unit/ts/riskManager.test.ts

import { RiskManager, RiskManagerOptions } from "../../../src/ts/services/riskManager";

describe("RiskManager", () => {
  const opts: RiskManagerOptions = {
    precisionWindow: 3,
    precisionThreshold: 0.8,
    dailyPnlThreshold: -0.02,
    maxLatencyMs: 150,
    maxPriceSlippage: 0.20,
    blockhashMaxAgeSec: 90,
  };
  let rm: RiskManager;

  beforeEach(() => {
    rm = new RiskManager(opts);
  });

  it("ska tillåta trading när precision över thresh och övriga defaults", () => {
    rm.recordTradeOutcome(true, 0.1);
    rm.recordTradeOutcome(true, 0.1);
    rm.recordTradeOutcome(true, 0.1);
    expect(rm.shouldTrade()).toBe(true);
  });

  it("ska blocka trading när precision under thresh", () => {
    rm.recordTradeOutcome(true, 0.1);
    rm.recordTradeOutcome(false, 0);
    rm.recordTradeOutcome(false, 0);
    expect(rm.shouldTrade()).toBe(false);
  });

  it("ska tillåta trading när daily PnL ligger över thresh", () => {
    rm.recordDailyPnl(-0.01);
    expect(rm.shouldTrade()).toBe(true);
  });

  it("ska blocka trading när daily PnL under thresh", () => {
    rm.recordDailyPnl(-0.03);
    expect(rm.shouldTrade()).toBe(false);
  });

  it("ska tillåta trading när latency under thresh", () => {
    rm.recordLatency(100);
    expect(rm.shouldTrade()).toBe(true);
  });

  it("ska blocka trading när latency över thresh", () => {
    rm.recordLatency(200);
    expect(rm.shouldTrade()).toBe(false);
  });

  it("ska tillåta trading när prisökning är inom slippage-gränsen", () => {
    rm.recordPrices(100, 118);
    expect(rm.shouldTrade()).toBe(true);
  });

  it("ska blocka trading när prisökning över slippage-gränsen", () => {
    rm.recordPrices(100, 121);
    expect(rm.shouldTrade()).toBe(false);
  });

  it("ska tillåta trading när blockhash-ålder är inom gränsen", () => {
    rm.recordBlockhashTimestamp(Date.now());
    expect(rm.shouldTrade()).toBe(true);
  });

  it("ska blocka trading när blockhash-ålder överstiger gränsen", () => {
    const oldTs = Date.now() - (opts.blockhashMaxAgeSec * 1000 + 1000);
    rm.recordBlockhashTimestamp(oldTs);
    expect(rm.shouldTrade()).toBe(false);
  });
});

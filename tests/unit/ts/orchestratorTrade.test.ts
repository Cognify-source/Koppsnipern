// tests/unit/ts/orchestratorTrade.test.ts

// 1) Mocka Solana-web3 tidigt: bara override fromSecretKey
jest.mock("@solana/web3.js", () => {
  const actual = jest.requireActual("@solana/web3.js");
  // Override fromSecretKey så den aldrig kraschar
  actual.Keypair.fromSecretKey = jest.fn(() => actual.Keypair.generate());
  return {
    __esModule: true,
    ...actual,
  };
});

// 2) Mocka övriga tjänster
jest.mock("../../../src/ts/services/streamListener", () => ({
  __esModule: true,
  StreamListener: jest.fn().mockImplementation((_url: string, cb: (slot: number) => Promise<void>) => ({
    start: jest.fn().mockResolvedValue(undefined),
    __callback: cb,
  })),
}));
jest.mock("../../../src/ts/services/featureService", () => ({
  __esModule: true,
  FeatureService: jest.fn().mockImplementation(() => ({
    extract: jest.fn(() => ({ dummy: 1 })),
  })),
}));
jest.mock("../../../src/ts/services/mlService", () => ({
  __esModule: true,
  MLService: jest.fn().mockImplementation(() => ({
    predict: jest.fn(() => 0.9),
  })),
}));
jest.mock("../../../src/ts/services/riskManager", () => ({
  __esModule: true,
  RiskManager: jest.fn().mockImplementation(() => ({
    recordLatency: jest.fn(),
    recordBlockhashTimestamp: jest.fn(),
    recordPrices: jest.fn(),
    recordDailyPnl: jest.fn(),
    shouldTrade: jest.fn(() => true),
    recordTradeOutcome: jest.fn(),
  })),
}));
jest.mock("../../../src/ts/services/tradeService", () => ({
  __esModule: true,
  TradeService: jest.fn().mockImplementation(() => ({
    executeSwap: jest.fn(async () => "fakeSig"),
  })),
}));

// 3) Importera först när mocks är på plats
import { main } from "../../../src/ts/index";
import { StreamListener } from "../../../src/ts/services/streamListener";
import { TradeService } from "../../../src/ts/services/tradeService";
import { PublicKey, Keypair } from "@solana/web3.js";

describe("Orchestrator TradePipeline", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Miljö för secret key + recipient
    process.env.PAYER_SECRET_KEY = JSON.stringify(Array(64).fill(1));
    // Använd riktig generate för att få giltig PublicKey
    process.env.TRADE_RECIPIENT = Keypair.generate().publicKey.toBase58();
  });

  it("ska starta listener och exekvera swap när score ok", async () => {
    // Starta orchestratorn
    await main();

    // Kontrollera att vår mockade StreamListener-konstruktor anropades
    expect(StreamListener).toHaveBeenCalledTimes(1);

    // Plocka ut callbacken från instansen
    const inst = (StreamListener as jest.Mock).mock.results[0].value;
    const cb = (inst as any).__callback as (slot: number) => Promise<void>;
    expect(typeof cb).toBe("function");

    // Simulera ett slot
    await cb(123);

    // Kontrollera att TradeService instansierades
    expect(TradeService).toHaveBeenCalled();

    // Och att executeSwap anropades med rätt parametrar
    const exec = (TradeService as jest.Mock).mock.results[0].value
      .executeSwap as jest.Mock;
    expect(exec).toHaveBeenCalledWith(expect.any(PublicKey), 0.1);
  });
});

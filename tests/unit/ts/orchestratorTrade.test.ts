// tests/unit/ts/orchestratorTrade.test.ts

// 1) Mocka Solana-web3 så Keypair.fromSecretKey aldrig validerar
jest.mock("@solana/web3.js", () => {
  const actual = jest.requireActual("@solana/web3.js");
  return {
    __esModule: true,
    ...actual,
    Keypair: {
      ...actual.Keypair,
      fromSecretKey: jest.fn(() => actual.Keypair.generate()),
    },
  };
});

// 2) Mocka dina tjänster
jest.mock("../../../src/ts/services/streamListener", () => ({
  __esModule: true,
  StreamListener: jest.fn().mockImplementation(
    (_url: string, cb: (slot: number) => Promise<void>) => ({
      start: jest.fn().mockResolvedValue(undefined),
      __callback: cb,
    })
  ),
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

// 3) Importera efter att mocks är definierade
import { main } from "../../../src/ts/index";
import { StreamListener } from "../../../src/ts/services/streamListener";
import { TradeService } from "../../../src/ts/services/tradeService";

describe("Orchestrator TradePipeline", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ange placeholder för secret key
    process.env.PAYER_SECRET_KEY = JSON.stringify(Array(64).fill(1));
  });

  it("ska starta listener och exekvera swap när score ok", async () => {
    // Kör orchestratorn som skapar StreamListener
    await main();

    // Kontrollera att StreamListener-instansen skapades
    expect(StreamListener).toHaveBeenCalledTimes(1);

    // Hämta callbacken och simulera en slot-händelse
    const inst = (StreamListener as jest.Mock).mock.results[0].value;
    const cb = (inst as any).__callback as (slot: number) => Promise<void>;
    await cb(123);

    // Kontrollera att TradeService instansierades och executeSwap anropades med 0.1
    expect(TradeService).toHaveBeenCalledTimes(1);
    const exec = (TradeService as jest.Mock).mock.results[0].value
      .executeSwap as jest.Mock;
    expect(exec).toHaveBeenCalledWith(0.1);
  });
});

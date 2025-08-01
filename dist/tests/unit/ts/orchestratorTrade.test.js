"use strict";
// tests/unit/ts/orchestratorTrade.test.ts
Object.defineProperty(exports, "__esModule", { value: true });
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
    StreamListener: jest.fn().mockImplementation((_url, cb) => ({
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
// 3) Importera efter att mocks är definierade
const index_1 = require("../../../src/ts/index");
const streamListener_1 = require("../../../src/ts/services/streamListener");
const tradeService_1 = require("../../../src/ts/services/tradeService");
describe("Orchestrator TradePipeline", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Ange placeholder för secret key
        process.env.PAYER_SECRET_KEY = JSON.stringify(Array(64).fill(1));
    });
    it("ska starta listener och exekvera swap när score ok", async () => {
        // Kör orchestratorn som skapar StreamListener
        await (0, index_1.main)();
        // Kontrollera att StreamListener-instansen skapades
        expect(streamListener_1.StreamListener).toHaveBeenCalledTimes(1);
        // Hämta callbacken och simulera en slot-händelse
        const inst = streamListener_1.StreamListener.mock.results[0].value;
        const cb = inst.__callback;
        await cb(123);
        // Kontrollera att TradeService instansierades och executeSwap anropades med 0.1
        expect(tradeService_1.TradeService).toHaveBeenCalledTimes(1);
        const exec = tradeService_1.TradeService.mock.results[0].value
            .executeSwap;
        expect(exec).toHaveBeenCalledWith(0.1);
    });
});

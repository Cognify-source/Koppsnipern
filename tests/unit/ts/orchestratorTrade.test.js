"use strict";
// tests/unit/ts/orchestratorTrade.test.ts
Object.defineProperty(exports, "__esModule", { value: true });
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
// 3) Importera först när mocks är på plats
const index_1 = require("../../../src/ts/index");
const streamListener_1 = require("../../../src/ts/services/streamListener");
const tradeService_1 = require("../../../src/ts/services/tradeService");
const web3_js_1 = require("@solana/web3.js");
describe("Orchestrator TradePipeline", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Miljö för secret key + recipient
        process.env.PAYER_SECRET_KEY = JSON.stringify(Array(64).fill(1));
        // Använd riktig generate för att få giltig PublicKey
        process.env.TRADE_RECIPIENT = web3_js_1.Keypair.generate().publicKey.toBase58();
    });
    it("ska starta listener och exekvera swap när score ok", async () => {
        // Starta orchestratorn
        await (0, index_1.main)();
        // Kontrollera att vår mockade StreamListener-konstruktor anropades
        expect(streamListener_1.StreamListener).toHaveBeenCalledTimes(1);
        // Plocka ut callbacken från instansen
        const inst = streamListener_1.StreamListener.mock.results[0].value;
        const cb = inst.__callback;
        expect(typeof cb).toBe("function");
        // Simulera ett slot
        await cb(123);
        // Kontrollera att TradeService instansierades
        expect(tradeService_1.TradeService).toHaveBeenCalled();
        // Och att executeSwap anropades med rätt parametrar
        const exec = tradeService_1.TradeService.mock.results[0].value
            .executeSwap;
        expect(exec).toHaveBeenCalledWith(expect.any(web3_js_1.PublicKey), 0.1);
    });
});

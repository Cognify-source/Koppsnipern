"use strict";
// tests/unit/ts/tradeService.test.ts
Object.defineProperty(exports, "__esModule", { value: true });
const tradeService_1 = require("../../../src/ts/services/tradeService");
const web3_js_1 = require("@solana/web3.js");
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
jest.mock("@raydium-io/raydium-sdk", () => {
    // Mock-fabrik utan att använda `new Transaction()`
    const jsonInfo2PoolKeys = jest.fn((json) => ({}));
    const Liquidity = {
        fetchInfo: jest.fn().mockResolvedValue({ userTokenAccounts: [] }),
        computeAmountOut: jest.fn().mockReturnValue({ amountOut: 0, minAmountOut: 0 }),
        makeSwapTransaction: jest.fn().mockResolvedValue({
            transaction: {
                feePayer: null,
                recentBlockhash: "",
                partialSign: jest.fn(),
                sign: jest.fn(),
                serialize: jest.fn().mockReturnValue(Buffer.from([1, 2, 3])),
            },
            signers: [],
        }),
    };
    return {
        __esModule: true,
        jsonInfo2PoolKeys,
        Liquidity,
    };
});
describe("TradeService (Raydium‐swap stub)", () => {
    let connection;
    let payer;
    let poolJson;
    let svc;
    beforeEach(() => {
        connection = {
            getRecentBlockhash: jest.fn().mockResolvedValue({
                blockhash: "bh",
                feeCalculator: { lamportsPerSignature: 0 },
            }),
            sendRawTransaction: jest.fn().mockResolvedValue("txSig"),
            confirmTransaction: jest.fn().mockResolvedValue({}),
        };
        payer = web3_js_1.Keypair.generate();
        poolJson = {};
        svc = new tradeService_1.TradeService({ connection, payer, poolJson });
    });
    it("använder Raydium‐SDK korrekt", async () => {
        const sig = await svc.executeSwap(0.5, 0.01);
        // Kontrollera att vi anropar SDK:erna
        expect(raydium_sdk_1.jsonInfo2PoolKeys).toHaveBeenCalledWith(poolJson);
        expect(raydium_sdk_1.Liquidity.fetchInfo).toHaveBeenCalledWith(connection, expect.any(Object));
        expect(raydium_sdk_1.Liquidity.computeAmountOut).toHaveBeenCalledWith(expect.any(Object), Math.round(0.5 * 1e9), 0.01);
        expect(raydium_sdk_1.Liquidity.makeSwapTransaction).toHaveBeenCalled();
        // Kontrollera att vi skicka den stub:ade buffern
        expect(connection.sendRawTransaction).toHaveBeenCalledWith(Buffer.from([1, 2, 3]), { skipPreflight: false, preflightCommitment: "confirmed" });
        expect(connection.confirmTransaction).toHaveBeenCalledWith("txSig", "confirmed");
        expect(sig).toBe("txSig");
    });
});

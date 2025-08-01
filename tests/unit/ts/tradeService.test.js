"use strict";
// tests/unit/ts/tradeService.test.ts
Object.defineProperty(exports, "__esModule", { value: true });
const tradeService_1 = require("../../../src/ts/services/tradeService");
const web3_js_1 = require("@solana/web3.js");
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
jest.mock("@raydium-io/raydium-sdk", () => ({
    __esModule: true,
    jsonInfo2PoolKeys: jest.fn((json) => ({})),
    Liquidity: {
        fetchInfo: jest.fn().mockResolvedValue({
            userTokenAccounts: [],
        }),
        computeAmountOut: jest.fn().mockReturnValue({
            amountOut: 0,
            minAmountOut: 0,
        }),
        makeSwapTransaction: jest.fn().mockResolvedValue({
            transaction: new web3_js_1.Transaction(),
            signers: [],
        }),
    },
}));
describe("TradeService (Raydium‐swap)", () => {
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
        expect(raydium_sdk_1.jsonInfo2PoolKeys).toHaveBeenCalledWith(poolJson);
        expect(raydium_sdk_1.Liquidity.fetchInfo).toHaveBeenCalledWith(connection, expect.any(Object));
        expect(raydium_sdk_1.Liquidity.computeAmountOut).toHaveBeenCalledWith(expect.any(Object), Math.round(0.5 * 1e9), 0.01);
        expect(raydium_sdk_1.Liquidity.makeSwapTransaction).toHaveBeenCalledWith(expect.objectContaining({
            connection,
            poolKeys: expect.any(Object),
            userKeys: expect.objectContaining({ owner: payer.publicKey }),
            amountIn: Math.round(0.5 * 1e9),
            amountOut: expect.any(Number),
            fixedSide: "in",
        }));
        expect(connection.sendRawTransaction).toHaveBeenCalledWith(expect.any(Buffer), { skipPreflight: false, preflightCommitment: "confirmed" });
        expect(connection.confirmTransaction).toHaveBeenCalledWith("txSig", "confirmed");
        expect(sig).toBe("txSig");
    });
});

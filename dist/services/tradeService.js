"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeService = void 0;
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
class TradeService {
    constructor(opts) {
        this.connection = opts.connection;
        this.payer = opts.payer;
        this.poolKeys = (0, raydium_sdk_1.jsonInfo2PoolKeys)(opts.poolJson);
    }
    async executeSwap(amountSol, slippage = 0.005) {
        const amountIn = Math.round(amountSol * 1e9);
        const poolState = await raydium_sdk_1.Liquidity.fetchInfo(this.connection, this.poolKeys);
        const { minAmountOut } = raydium_sdk_1.Liquidity.computeAmountOut(poolState, amountIn, slippage);
        const { transaction, signers } = await raydium_sdk_1.Liquidity.makeSwapTransaction({
            connection: this.connection,
            poolKeys: this.poolKeys,
            userKeys: {
                owner: this.payer.publicKey,
                tokenAccounts: poolState.userTokenAccounts,
            },
            amountIn,
            amountOut: minAmountOut,
            fixedSide: "in",
        });
        transaction.feePayer = this.payer.publicKey;
        const { blockhash } = await this.connection.getRecentBlockhash("confirmed");
        transaction.recentBlockhash = blockhash;
        transaction.partialSign(...signers);
        transaction.sign(this.payer);
        const raw = transaction.serialize();
        const sig = await this.connection.sendRawTransaction(raw, {
            skipPreflight: false,
            preflightCommitment: "confirmed",
        });
        await this.connection.confirmTransaction(sig, "confirmed");
        return sig;
    }
}
exports.TradeService = TradeService;

"use strict";
// src/ts/services/tradeService.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeService = void 0;
const web3_js_1 = require("@solana/web3.js");
/**
 * TradeService bygger och skickar en "swap" i form av
 * en enkel SOL-transfer (placeholder för riktig swap).
 */
class TradeService {
    constructor(opts) {
        this.connection = opts.connection;
        this.payer = opts.payer;
    }
    /**
     * Skickar `amountSol` SOL till `recipient`. Returnerar transaktionens signature.
     */
    async executeSwap(recipient, amountSol) {
        const lamports = Math.round(amountSol * 1e9);
        // Hämta blockhash
        const { blockhash } = await this.connection.getRecentBlockhash("confirmed");
        // Bygg transaktionen
        const tx = new web3_js_1.Transaction({
            recentBlockhash: blockhash,
            feePayer: this.payer.publicKey,
        });
        tx.add(web3_js_1.SystemProgram.transfer({
            fromPubkey: this.payer.publicKey,
            toPubkey: recipient,
            lamports,
        }));
        // Signera
        tx.sign(this.payer);
        const raw = tx.serialize();
        // Skicka
        const signature = await this.connection.sendRawTransaction(raw, {
            skipPreflight: false,
            preflightCommitment: "confirmed",
        });
        // Bekräfta
        await this.connection.confirmTransaction(signature, "confirmed");
        return signature;
    }
}
exports.TradeService = TradeService;

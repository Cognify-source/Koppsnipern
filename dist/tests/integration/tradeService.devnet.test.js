"use strict";
// tests/integration/tradeService.devnet.test.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
// Rätt relativ sökväg till TradeService
const tradeService_1 = require("../../src/ts/services/tradeService");
// Nu funkar JSON-import tack vare resolveJsonModule och json.d.ts
const devnet_pool_json_1 = __importDefault(require("./devnet-pool.json"));
jest.setTimeout(60000);
describe("TradeService Devnet Integration", () => {
    let connection;
    let payer;
    let svc;
    beforeAll(async () => {
        const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
        const secretKey = JSON.parse(process.env.PAYER_SECRET_KEY);
        payer = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(secretKey));
        connection = new web3_js_1.Connection(rpcUrl, "confirmed");
        svc = new tradeService_1.TradeService({ connection, payer, poolJson: devnet_pool_json_1.default });
    });
    it("ska exekvera swap 0.01 SOL på Devnet", async () => {
        const sig = await svc.executeSwap(0.01, 0.005);
        console.log("Devnet swap signature:", sig);
        expect(typeof sig).toBe("string");
        const res = await connection.getTransaction(sig, {
            commitment: "confirmed",
        });
        expect(res).not.toBeNull();
    });
});

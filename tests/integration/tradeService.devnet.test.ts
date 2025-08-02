import { Connection, Keypair } from "@solana/web3.js";
import { TradeService } from "../../src/ts/services/tradeService";
import poolJson from "./devnet-pool.json";

jest.setTimeout(60000);

describe("TradeService Devnet Integration", () => {
  // Om ingen secret-key är satt: skippa hela suite
  if (!process.env.PAYER_SECRET_KEY) {
    it("skipped because PAYER_SECRET_KEY is not set", () => {
      console.warn("▶️ Skipping Devnet test: inga env-vars för PAYER_SECRET_KEY");
    });
    return;
  }

  let connection: Connection;
  let payer: Keypair;
  let svc: TradeService;

  beforeAll(async () => {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const secretKey = JSON.parse(process.env.PAYER_SECRET_KEY);
    payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));

    connection = new Connection(rpcUrl, "confirmed");
    svc = new TradeService({ connection, payer, poolJson });
  });

  it("ska exekvera swap 0.01 SOL på Devnet", async () => {
    const sig = await svc.executeSwap(0.01, 0.005);
    console.log("Devnet swap signature:", sig);
    expect(typeof sig).toBe("string");
    const res = await connection.getTransaction(sig, { commitment: "confirmed" });
    expect(res).not.toBeNull();
  });
});

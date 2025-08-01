// tests/unit/ts/tradeService.test.ts

import { TradeService } from "../../../src/ts/services/tradeService";
import { Connection, Keypair } from "@solana/web3.js";
import {
  jsonInfo2PoolKeys,
  Liquidity,
  LiquidityPoolJsonInfo,
} from "@raydium-io/raydium-sdk";

jest.mock("@raydium-io/raydium-sdk", () => {
  // Mock-fabrik utan att använda `new Transaction()`
  const jsonInfo2PoolKeys = jest.fn((json: any) => ({} as LiquidityPoolJsonInfo));
  const Liquidity = {
    fetchInfo: jest.fn().mockResolvedValue({ userTokenAccounts: [] as any[] }),
    computeAmountOut: jest.fn().mockReturnValue({ amountOut: 0, minAmountOut: 0 }),
    makeSwapTransaction: jest.fn().mockResolvedValue({
      transaction: {
        feePayer: null,
        recentBlockhash: "",
        partialSign: jest.fn(),
        sign: jest.fn(),
        serialize: jest.fn().mockReturnValue(Buffer.from([1, 2, 3])),
      },
      signers: [] as Keypair[],
    }),
  };
  return {
    __esModule: true,
    jsonInfo2PoolKeys,
    Liquidity,
  };
});

describe("TradeService (Raydium‐swap stub)", () => {
  let connection: jest.Mocked<Connection>;
  let payer: Keypair;
  let poolJson: LiquidityPoolJsonInfo;
  let svc: TradeService;

  beforeEach(() => {
    connection = {
      getRecentBlockhash: jest.fn().mockResolvedValue({
        blockhash: "bh",
        feeCalculator: { lamportsPerSignature: 0 },
      }),
      sendRawTransaction: jest.fn().mockResolvedValue("txSig"),
      confirmTransaction: jest.fn().mockResolvedValue({}),
    } as any;

    payer = Keypair.generate();
    poolJson = {} as LiquidityPoolJsonInfo;
    svc = new TradeService({ connection, payer, poolJson });
  });

  it("använder Raydium‐SDK korrekt", async () => {
    const sig = await svc.executeSwap(0.5, 0.01);

    // Kontrollera att vi anropar SDK:erna
    expect(jsonInfo2PoolKeys).toHaveBeenCalledWith(poolJson);
    expect(Liquidity.fetchInfo).toHaveBeenCalledWith(connection, expect.any(Object));
    expect(Liquidity.computeAmountOut).toHaveBeenCalledWith(
      expect.any(Object),
      Math.round(0.5 * 1e9),
      0.01
    );
    expect(Liquidity.makeSwapTransaction).toHaveBeenCalled();

    // Kontrollera att vi skicka den stub:ade buffern
    expect(connection.sendRawTransaction).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      { skipPreflight: false, preflightCommitment: "confirmed" }
    );
    expect(connection.confirmTransaction).toHaveBeenCalledWith("txSig", "confirmed");
    expect(sig).toBe("txSig");
  });
});

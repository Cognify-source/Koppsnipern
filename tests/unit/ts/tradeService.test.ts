// tests/unit/ts/tradeService.test.ts

import { TradeService } from "../../../src/ts/services/tradeService";
import {
  Connection,
  Keypair,
  Transaction,
  SystemProgram,
  PublicKey,
} from "@solana/web3.js";

describe("TradeService (SOL-transfer stub)", () => {
  let connectionMock: jest.Mocked<Connection>;
  let payer: Keypair;
  let svc: TradeService;
  let addSpy: jest.SpyInstance;

  const recipient = new PublicKey(
    "4Nd1mCbA3ZBj1VwdgnTUA6zdi6t9s3tfG4PzP5r49e8Z"
  );

  beforeEach(() => {
    // Mocka bara de metoder vi använder
    connectionMock = {
      getRecentBlockhash: jest
        .fn()
        .mockResolvedValue({ blockhash: "bh123", feeCalculator: { lamportsPerSignature: 0 } }),
      sendRawTransaction: jest.fn().mockResolvedValue("sigABC"),
      confirmTransaction: jest.fn().mockResolvedValue({}),
    } as any;

    payer = Keypair.generate();
    svc = new TradeService({ connection: connectionMock, payer });

    // Spy på Transaction.prototype.add med korrekt 'this'-typ
    addSpy = jest
      .spyOn(Transaction.prototype, "add")
      .mockImplementation(function (this: Transaction, ..._args: any[]) {
        return this;
      });

    // Stubba Transaction.sign och serialize
    jest.spyOn(Transaction.prototype, "sign").mockImplementation(() => {});
    jest.spyOn(Transaction.prototype, "serialize").mockImplementation(() => Buffer.from([1, 2, 3]));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("bygger, signerar och skickar en transfer-tx", async () => {
    const sig = await svc.executeSwap(recipient, 0.42);

    // Kontrollera blockhash-anropet
    expect(connectionMock.getRecentBlockhash).toHaveBeenCalledWith("confirmed");

    // Kontrollera att vi la till exakt en instruktion
    expect(addSpy).toHaveBeenCalledTimes(1);

    // Kontrollera signering och serialisering
    expect(Transaction.prototype.sign).toHaveBeenCalledWith(payer);
    expect(Transaction.prototype.serialize).toHaveBeenCalled();

    // Kontrollera skicka och confirm
    expect(connectionMock.sendRawTransaction).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      { skipPreflight: false, preflightCommitment: "confirmed" }
    );
    expect(connectionMock.confirmTransaction).toHaveBeenCalledWith("sigABC", "confirmed");

    expect(sig).toBe("sigABC");
  });
});

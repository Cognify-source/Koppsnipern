// src/ts/services/tradeService.ts
import {
  Connection,
  Keypair,
} from "@solana/web3.js";
import {
  Liquidity,
  LiquidityPoolKeys,
} from "@raydium-io/raydium-sdk";

// The constructor options are simplified
export interface TradeServiceOptions {
  connection: Connection;
  payer: Keypair;
}

export class TradeService {
  private connection: Connection;
  private payer: Keypair;
  // The static poolKeys property is removed from the class state

  constructor(opts: TradeServiceOptions) {
    this.connection = opts.connection;
    this.payer = opts.payer;
    // No longer setting static poolKeys here
  }

  // executeSwap now takes the dynamic poolKeys for the specific trade
  async executeSwap(
    poolKeys: LiquidityPoolKeys,
    amountSol: number,
    slippage: number = 0.005
  ): Promise<string> {
    const amountIn = Math.round(amountSol * 1e9);
    // It uses the passed-in poolKeys
    const poolState = await Liquidity.fetchInfo(this.connection, poolKeys);

    // This part of the logic remains the same as the original file
    const { minAmountOut } = Liquidity.computeAmountOut(
      poolState,
      amountIn,
      slippage
    );
    const { transaction, signers } = await Liquidity.makeSwapTransaction({
      connection: this.connection,
      poolKeys: poolKeys, // Use the passed-in poolKeys
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

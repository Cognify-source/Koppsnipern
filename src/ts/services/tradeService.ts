// src/ts/services/tradeService.ts

import {
  Connection,
  Keypair,
  Transaction,
} from "@solana/web3.js";
import {
  jsonInfo2PoolKeys,
  Liquidity,
  LiquidityPoolJsonInfo,
  LiquidityPoolKeys,
} from "@raydium-io/raydium-sdk";

export interface TradeServiceOptions {
  connection: Connection;
  payer: Keypair;
  poolJson: LiquidityPoolJsonInfo;
}

export class TradeService {
  private connection: Connection;
  private payer: Keypair;
  private poolKeys: LiquidityPoolKeys;

  constructor(opts: TradeServiceOptions) {
    this.connection = opts.connection;
    this.payer = opts.payer;
    this.poolKeys = jsonInfo2PoolKeys(opts.poolJson);
  }

  /**
   * amountSol = hur mycket SOL att swappa
   * slippage = t.ex. 0.005 för 0.5%
   */
  async executeSwap(
    amountSol: number,
    slippage: number = 0.005
  ): Promise<string> {
    const amountIn = Math.round(amountSol * 1e9);

    const poolState = await Liquidity.fetchInfo(this.connection, this.poolKeys);
    const { minAmountOut } = Liquidity.computeAmountOut(
      poolState,
      amountIn,
      slippage
    );

    const { transaction, signers } = await Liquidity.makeSwapTransaction({
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
    const { blockhash } =
      await this.connection.getRecentBlockhash("confirmed");
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

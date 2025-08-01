// src/types/raydium-sdk.d.ts
declare module "@raydium-io/raydium-sdk" {
  import {
    Connection,
    Transaction,
    PublicKey,
    Keypair,
  } from "@solana/web3.js";

  export interface LiquidityPoolJsonInfo {
    [key: string]: any;
  }
  export interface LiquidityPoolKeys {
    [key: string]: any;
  }

  export function jsonInfo2PoolKeys(
    json: LiquidityPoolJsonInfo
  ): LiquidityPoolKeys;

  export class Liquidity {
    static fetchInfo(
      connection: Connection,
      poolKeys: LiquidityPoolKeys
    ): Promise<{
      userTokenAccounts: PublicKey[];
      [key: string]: any;
    }>;

    static computeAmountOut(
      poolState: any,
      amountIn: number,
      slippage: number
    ): { amountOut: number; minAmountOut: number };

    static makeSwapTransaction(opts: {
      connection: Connection;
      poolKeys: LiquidityPoolKeys;
      userKeys: { owner: PublicKey; tokenAccounts: PublicKey[] };
      amountIn: number;
      amountOut: number;
      fixedSide: "in" | "out";
    }): Promise<{
      transaction: Transaction;
      signers: Keypair[];
    }>;
  }
}

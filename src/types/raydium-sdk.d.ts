// src/types/raydium-sdk.d.ts
declare module "@raydium-io/raydium-sdk" {
  export type LiquidityPoolJsonInfo = any;
  export type LiquidityPoolKeys = any;

  export function jsonInfo2PoolKeys(
    json: LiquidityPoolJsonInfo
  ): LiquidityPoolKeys;

  export class Liquidity {
    static fetchInfo(
      connection: any,
      poolKeys: any
    ): Promise<{
      userTokenAccounts: any[];
      [key: string]: any;
    }>;

    static computeAmountOut(
      poolState: any,
      amountIn: number,
      slippage: number
    ): { amountOut: number; minAmountOut: number };

    static makeSwapTransaction(opts: {
      connection: any;
      poolKeys: any;
      userKeys: { owner: any; tokenAccounts: any[] };
      amountIn: number;
      amountOut: number;
      fixedSide: "in" | "out";
    }): Promise<{
      transaction: any;
      signers: any[];
    }>;
  }
}

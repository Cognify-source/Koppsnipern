// src/ts/services/tradeServiceBase.ts
import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { NATIVE_MINT } from '@solana/spl-token';
import axios from 'axios';
import { API_URLS } from '@raydium-io/raydium-sdk-v2';
import { PoolData } from "../safetyService";

export interface TradeServiceOptions {
  connection: Connection;
  payer: Keypair;
}

// A simplified interface for the swap computation response
interface SwapCompute {
  swapResponse: any; // The full response is complex, using 'any' for simplicity
}

export class TradeService {
  private connection: Connection;
  private owner: Keypair;

  constructor(opts: TradeServiceOptions) {
    this.connection = opts.connection;
    this.owner = opts.payer;
  }

  // The executeSwap method is now much simpler from the orchestrator's perspective
  async executeSwap(
    poolData: PoolData, // We still need the pool's mint
    amountSol: number
  ): Promise<string> {
    console.log(`[TRADE_SERVICE_V2] Attempting to swap ${amountSol} SOL for ${poolData.mint}`);

    const inputMint = NATIVE_MINT.toBase58(); // We are always swapping SOL
    const outputMint = poolData.mint;
    const amount = Math.round(amountSol * 1e9); // Amount in lamports
    const slippage = 0.5; // 0.5%
    const txVersion = 'V0';
    const isV0Tx = txVersion === 'V0';

    // 1. Get compute units and swap information from Raydium API
    const { data: feeData } = await axios.get<{ data: { default: { vh: number } } }>(`${API_URLS.BASE_HOST}${API_URLS.PRIORITY_FEE}`);
    const { data: swapResponse } = await axios.get<SwapCompute>(
      `${API_URLS.SWAP_HOST}/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage * 100}&txVersion=${txVersion}`
    );

    // 2. Get the transaction object from the Raydium API
    const { data: swapTransactions } = await axios.post<{ data: { transaction: string }[] }>(`${API_URLS.SWAP_HOST}/transaction/swap-base-in`, {
      computeUnitPriceMicroLamports: String(feeData.data.default.vh),
      swapResponse,
      txVersion,
      wallet: this.owner.publicKey.toBase58(),
      wrapSol: true, // We are sending SOL, so it needs to be wrapped
      unwrapSol: false, // We are receiving a token, not SOL
    });

    // 3. Deserialize, sign, and send the transaction
    const allTxBuf = swapTransactions.data.map((tx) => Buffer.from(tx.transaction, 'base64'));
    const allTransactions = allTxBuf.map((txBuf) => isV0Tx ? VersionedTransaction.deserialize(txBuf) : Transaction.from(txBuf));

    let lastTxId = '';
    for (let i = 0; i < allTransactions.length; i++) {
      const tx = allTransactions[i];
      if (isV0Tx) {
        (tx as VersionedTransaction).sign([this.owner]);
        lastTxId = await this.connection.sendTransaction(tx as VersionedTransaction, { skipPreflight: true });
        console.log(`[TRADE_SERVICE_V2] Sent V0 transaction ${i + 1}/${allTransactions.length}: ${lastTxId}`);
      } else {
        (tx as Transaction).sign(this.owner);
        lastTxId = await sendAndConfirmTransaction(this.connection, tx as Transaction, [this.owner], { skipPreflight: true });
        console.log(`[TRADE_SERVICE_V2] Sent Legacy transaction ${i + 1}/${allTransactions.length}: ${lastTxId}`);
      }
    }

    // We can only confirm the last transaction easily with this setup
    const { lastValidBlockHeight, blockhash } = await this.connection.getLatestBlockhash({ commitment: 'finalized' });
    await this.connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: lastTxId }, 'confirmed');
    console.log(`[TRADE_SERVICE_V2] Swap confirmed for last transaction.`);

    return lastTxId;
  }
}

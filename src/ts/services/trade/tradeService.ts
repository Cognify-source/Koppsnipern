// src/ts/services/tradeServiceBase.ts
import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { NATIVE_MINT, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import axios from 'axios';
import { API_URLS } from '@raydium-io/raydium-sdk-v2';
import { PoolData } from "../safetyService";
import { ConnectionManager } from "../../utils/connectionManager";
import * as borsh from 'borsh';
import BN from 'bn.js';
import { createHash } from 'crypto';

export interface TradeServiceOptions {
  connection: Connection;
  payer: Keypair;
}

// A simplified interface for the swap computation response
interface SwapCompute {
  swapResponse: any; // The full response is complex, using 'any' for simplicity
}

const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_GLOBAL_ADDRESS = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
const PUMP_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
const RENT_SYSVAR = new PublicKey('SysvarRent111111111111111111111111111111111');
const PUMP_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// Borsh schema for deserializing the BondingCurve account
const BondingCurveAccountSchema = {
  struct: {
    virtualTokenReserves: 'u64',
    virtualSolReserves: 'u64',
    realTokenReserves: 'u64',
    realSolReserves: 'u64',
    tokenTotalSupply: 'u64',
    complete: 'u8',
  }
};

// Borsh schema for serializing the buy instruction data
const BuyInstructionSchema = {
  struct: {
    tokenAmountOut: 'u64',
    maxSolCost: 'u64',
  }
};

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
    const { lastValidBlockHeight, blockhash } = await ConnectionManager.getLatestBlockhash({ commitment: 'finalized' }, 'TradeService-Confirm');
    await ConnectionManager.confirmTransaction({ blockhash, lastValidBlockHeight, signature: lastTxId }, 'confirmed', 'TradeService-Confirm');
    console.log(`[TRADE_SERVICE_V2] Swap confirmed for last transaction.`);

    return lastTxId;
  }

  public async prepareSwapTransaction(
    poolData: PoolData,
    amountInSol: number,
    priorityFeeInSol: number = 0.001,
  ): Promise<Transaction> {
    console.log(`[TRADE_SERVICE] Preparing swap transaction for ${poolData.mint} with ${amountInSol} SOL.`);

    if (poolData.source !== 'PumpV1') {
      throw new Error(`Unsupported pool source: ${poolData.source}`);
    }

    // 1. Fetch the bonding curve account to calculate the price
    const bondingCurveAddress = new PublicKey(poolData.address);
    const bondingCurveAccountInfo = await ConnectionManager.getAccountInfo(bondingCurveAddress, 'TradeService-BondingCurve');
    if (!bondingCurveAccountInfo) {
      throw new Error('Failed to fetch bonding curve account info.');
    }
    const decodedBondingCurve = borsh.deserialize(
      BondingCurveAccountSchema as any,
      bondingCurveAccountInfo.data.slice(8)
    ) as { [key: string]: BN };

    if (!decodedBondingCurve) {
      throw new Error('Failed to deserialize bonding curve account.');
    }

    // Calculate how many tokens we get for the input SOL amount
    // This is a simplified version of the bonding curve calculation: (s * V) / v
    // s = sol input, V = virtual token reserves, v = virtual sol reserves
    const solInLamports = new BN(amountInSol * 1e9);
    const tokenAmountOut = solInLamports
      .mul(decodedBondingCurve.virtualTokenReserves)
      .div(decodedBondingCurve.virtualSolReserves);

    console.log(`[TRADE_SERVICE] Calculated token amount out: ${tokenAmountOut.toString()}`);

    // 2. Define all accounts needed for the instruction
    const mintPublicKey = new PublicKey(poolData.mint);
    const userAta = await getAssociatedTokenAddress(mintPublicKey, this.owner.publicKey);

    const accounts = [
      { pubkey: PUMP_GLOBAL_ADDRESS, isSigner: false, isWritable: false },
      { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: true },
      { pubkey: mintPublicKey, isSigner: false, isWritable: false },
      { pubkey: bondingCurveAddress, isSigner: false, isWritable: true },
      { pubkey: bondingCurveAddress, isSigner: false, isWritable: true }, // Associated Bonding Curve, same as bonding curve address
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: this.owner.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: RENT_SYSVAR, isSigner: false, isWritable: false },
      { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // 3. Create the instruction data
    const instructionName = 'buy';
    const discriminator = createHash('sha256').update(`global:${instructionName}`).digest().slice(0, 8);

    const instructionDataObject = {
      tokenAmountOut: tokenAmountOut,
      maxSolCost: new BN(amountInSol * 1e9 * 1.05) // Allow 5% slippage
    };
    const instructionDataBuffer = borsh.serialize(BuyInstructionSchema as any, instructionDataObject);

    const instructionData = Buffer.concat([discriminator, instructionDataBuffer]);

    // 4. Build the transaction
    const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: Math.round(priorityFeeInSol * 1e9 * 1e6 / 1400000), // Approximate lamports to micro-lamports
    });

    const computeLimitInstruction = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1400000,
    });

    const swapInstruction = new TransactionInstruction({
      keys: accounts,
      programId: PUMP_PROGRAM_ID,
      data: instructionData,
    });

    const transaction = new Transaction();
    transaction.add(priorityFeeInstruction);
    transaction.add(computeLimitInstruction);
    transaction.add(swapInstruction);

    transaction.feePayer = this.owner.publicKey;

    return transaction;
  }
}

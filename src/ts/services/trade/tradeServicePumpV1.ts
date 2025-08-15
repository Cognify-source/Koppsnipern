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
import * as borsh from 'borsh';
import BN from 'bn.js';
import { createHash } from 'crypto';

export interface TradeServiceOptions {
  connection: Connection;
  payer: Keypair;
}

interface SwapCompute {
  swapResponse: any;
}

const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_GLOBAL_ADDRESS = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
const PUMP_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
const RENT_SYSVAR = new PublicKey('SysvarRent111111111111111111111111111111111');
const PUMP_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

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

const BuyInstructionSchema = {
  struct: {
    tokenAmountOut: 'u64',
    maxSolCost: 'u64',
  }
};

export class TradeServicePumpV1 {
  private connection: Connection;
  private owner: Keypair;

  constructor(opts: TradeServiceOptions) {
    this.connection = opts.connection;
    this.owner = opts.payer;
  }

  async executeSwap(poolData: PoolData, amountSol: number): Promise<string> {
    console.log(`[PUMPV1] Attempting to swap ${amountSol} SOL for ${poolData.mint}`);
    const inputMint = NATIVE_MINT.toBase58();
    const outputMint = poolData.mint;
    const amount = Math.round(amountSol * 1e9);
    const slippage = 0.5;
    const txVersion = 'V0';
    const isV0Tx = txVersion === 'V0';

    const [feeRes, swapRes] = await Promise.all([
      axios.get(`${API_URLS.BASE_HOST}${API_URLS.PRIORITY_FEE}`),
      axios.get(`${API_URLS.SWAP_HOST}/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage * 100}&txVersion=${txVersion}`)
    ]);
    const feeData = feeRes.data;
    const swapResponse = (swapRes.data as SwapCompute).swapResponse;

    const { data: swapTransactions } = await axios.post<{ data: { transaction: string }[] }>(`${API_URLS.SWAP_HOST}/transaction/swap-base-in`, {
      computeUnitPriceMicroLamports: String(feeData.data.default.vh),
      swapResponse,
      txVersion,
      wallet: this.owner.publicKey.toBase58(),
      wrapSol: true,
      unwrapSol: false,
    });

    const allTransactions = swapTransactions.data.map((tx) => {
      const buf = Buffer.from(tx.transaction, 'base64');
      return isV0Tx ? VersionedTransaction.deserialize(buf) : Transaction.from(buf);
    });

    let lastTxId = '';
    for (let i = 0; i < allTransactions.length; i++) {
      const tx = allTransactions[i];
      if (isV0Tx) {
        (tx as VersionedTransaction).sign([this.owner]);
        lastTxId = await this.connection.sendTransaction(tx as VersionedTransaction, { skipPreflight: true });
      } else {
        (tx as Transaction).sign(this.owner);
        lastTxId = await sendAndConfirmTransaction(this.connection, tx as Transaction, [this.owner], { skipPreflight: true });
      }
    }

    const { lastValidBlockHeight, blockhash } = await this.connection.getLatestBlockhash({ commitment: 'finalized' });
    await this.connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: lastTxId }, 'finalized');
    return lastTxId;
  }

  public async prepareSwapTransaction(poolData: PoolData, amountInSol: number, priorityFeeInSol: number = 0.001): Promise<Transaction> {
    if (poolData.source !== 'PumpV1') {
      throw new Error(`Unsupported pool source: ${poolData.source}`);
    }

    const bondingCurveAddress = new PublicKey(poolData.address);
    const bondingCurveAccountInfo = await this.connection.getAccountInfo(bondingCurveAddress);
    if (!bondingCurveAccountInfo) throw new Error('Failed to fetch bonding curve account info.');

    const decodedBondingCurve = borsh.deserialize(
      BondingCurveAccountSchema as any,
      bondingCurveAccountInfo.data.slice(8)
    ) as { [key: string]: BN };

    const solInLamports = new BN(amountInSol * 1e9);
    const tokenAmountOut = solInLamports
      .mul(decodedBondingCurve.virtualTokenReserves)
      .div(decodedBondingCurve.virtualSolReserves);

    const mintPublicKey = new PublicKey(poolData.mint);
    const userAta = await getAssociatedTokenAddress(mintPublicKey, this.owner.publicKey);

    const accounts = [
      { pubkey: PUMP_GLOBAL_ADDRESS, isSigner: false, isWritable: false },
      { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: true },
      { pubkey: mintPublicKey, isSigner: false, isWritable: false },
      { pubkey: bondingCurveAddress, isSigner: false, isWritable: true },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: this.owner.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: RENT_SYSVAR, isSigner: false, isWritable: false },
      { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const discriminator = createHash('sha256').update(`global:buy`).digest().slice(0, 8);
    const instructionDataObject = {
      tokenAmountOut: tokenAmountOut,
      maxSolCost: new BN(amountInSol * 1e9 * 1.03) // 3% slippage per OP
    };
    const instructionDataBuffer = borsh.serialize(BuyInstructionSchema as any, instructionDataObject);
    const instructionData = Buffer.concat([discriminator, instructionDataBuffer]);

    const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: Math.round(priorityFeeInSol * 1e9 * 1e6 / 1400000),
    });
    const computeLimitInstruction = ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 });

    const swapInstruction = new TransactionInstruction({
      keys: accounts,
      programId: PUMP_PROGRAM_ID,
      data: instructionData,
    });

    const transaction = new Transaction();
    transaction.add(priorityFeeInstruction, computeLimitInstruction, swapInstruction);
    transaction.feePayer = this.owner.publicKey;

    return transaction;
  }
}

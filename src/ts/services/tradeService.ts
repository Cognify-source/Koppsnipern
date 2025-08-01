// src/ts/services/tradeService.ts

import {
  Connection,
  Keypair,
  Transaction,
  SystemProgram,
  PublicKey,
} from "@solana/web3.js";

export interface TradeServiceOptions {
  connection: Connection;
  payer: Keypair;
}

/**
 * TradeService bygger och skickar en "swap" i form av
 * en enkel SOL-transfer (placeholder för riktig swap).
 */
export class TradeService {
  private connection: Connection;
  private payer: Keypair;

  constructor(opts: TradeServiceOptions) {
    this.connection = opts.connection;
    this.payer = opts.payer;
  }

  /**
   * Skickar `amountSol` SOL till `recipient`. Returnerar transaktionens signature.
   */
  async executeSwap(
    recipient: PublicKey,
    amountSol: number
  ): Promise<string> {
    const lamports = Math.round(amountSol * 1e9);
    // Hämta blockhash
    const { blockhash } = await this.connection.getRecentBlockhash(
      "confirmed"
    );
    // Bygg transaktionen
    const tx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: this.payer.publicKey,
    });
    tx.add(
      SystemProgram.transfer({
        fromPubkey: this.payer.publicKey,
        toPubkey: recipient,
        lamports,
      })
    );
    // Signera
    tx.sign(this.payer);
    const raw = tx.serialize();
    // Skicka
    const signature = await this.connection.sendRawTransaction(raw, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    // Bekräfta
    await this.connection.confirmTransaction(signature, "confirmed");
    return signature;
  }
}

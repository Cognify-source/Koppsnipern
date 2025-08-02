// scripts/airdrop.ts
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

// Hämtar secret key från env och airdroppar 1 SOL
async function airdrop() {
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const secretKey = JSON.parse(process.env.PAYER_SECRET_KEY!);
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  const conn = new Connection(rpcUrl, "confirmed");
  console.log("▶️ Begär airdrop på Devnet...");
  const sig = await conn.requestAirdrop(payer.publicKey, 1 * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig, "confirmed");
  console.log(`✅ Airdrop klar: ${sig}`);
}

airdrop().catch((err) => {
  console.error(err);
  process.exit(1);
});

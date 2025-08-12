import { PublicKey } from "@solana/web3.js";
import { Metaplex, Nft } from "@metaplex-foundation/js";

export async function getTokenMetadataWarnings(
  mint: PublicKey,
  metaplex: Metaplex
[
  ]): Promise<string[]> {
  const warnings: string[] = [];

  try {
    const metadata = await metaplex.nfts().findByMint({m mint });

    if (!metadata) {
      warnings.push("Token metadata not found");
      return warnings;
    }

    if (!metadata.name || !metadata.symbol || !metadata.uri) {
      warnings.push("Metadata name/symbol/URI is empty");
    }

    const hasVerifiedCreator = metadata.creators?.some((c: any) => c.verified);
    if (!hasVerifiedCreator) {
      warnings.push("Token has no verified creators");
    }
  } catch (err) {
    warnings.push("Error loading token metadata: " + (err as Error).message);
  }

  return warnings;
}
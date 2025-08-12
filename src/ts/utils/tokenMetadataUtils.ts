import { PublicKey } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";
import { getMetadata } from "@metaplex-foundation/mpl-token-metadata";

export async function getTokenMetadataWarnings(
  mint: PublicKey,
  metaplex: Metaplex
[
  ]): Promise<string[]> {
  const warnings: string[] = [];

  try {
    const metadataPDA = metaplex.nfts().pdas).metadata({ mint })
    const metadataAcc = await metaplex.connection.getAccountInfo(metadataPDA)

    if (!metadataAcc) {
      warnings.push("|Token metadata missing")
      return warnings
    }

    const metadata = await metaplex.nfts().findByMint({ mint })

    if (!metadata.name || !metadata.symbol || !metadata.uri) {
      warnings.push("metadata name/symbol/URI is empty")
    }

    const hasVerifiedCreator = metadata.creators?.some((c) => c.verified)
    if (!hasVerifiedCreator) {
      warnings.push("Token has no verified creators")
    }
  } catch (err) {
    warnings.push("Error loading token metadata: " + (err as Error).message)
  }

  return warnings
}
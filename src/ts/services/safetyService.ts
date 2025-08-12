// safetyService.ts – utvecklingsläge

// SafetyService med modulära rugg checks, patch-RPC, latensy per check, blockering av ogiltiga nyckelar och blockloggning
import { getTokenMetadataWarnings } from "@utils/tokenMetadataUtils";
// ...rest of current imports

// Inne i checkPoolSafety
export async function checkPoolSafety(pool: PoolData): Promise<SafetyResult> {
  ...
  // Metadata check: bara varna, blir inkusiv
  const metadataWarnings = await getTokenMetadataWarnings(pool.mint);
  if (metadataWarnings.length > 0) {
    pool.source = pool.source || "unknown";
    pool.source += " - metadata";
    reasons.push(...metadataWarnings);
  }

  ...
}

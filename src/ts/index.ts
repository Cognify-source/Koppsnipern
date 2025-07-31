// src/ts/index.ts

import path from "path";
import { StreamListener } from "./services/streamListener";
import { measureLatency } from "./utils/latency";
import { BundleSender } from "./services/bundleSender";
import { MLService } from "./services/mlService";

async function main() {
  console.log("🚀 Orchestrator startar med ML...");

  // Initiera ML-servicen
  const ml = new MLService({
    pythonPath: process.env.PYTHON_PATH || "python3",
    scriptPath: process.env.ML_SCRIPT
      ? path.resolve(process.cwd(), process.env.ML_SCRIPT)
      : undefined,
  });

  // Sätt upp Slot-lyssnaren
  const listener = new StreamListener(
    process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    async (slot) => {
      console.log(`🕵️‍♂️ Ny slot: ${slot}`);

      // 1) Mät RTT (stub)
      const { result: pingOk, latencyMs } = await measureLatency(async () => {
        // Här kan du pinga Jito-endpoint med fetch
        return true;
      });
      console.log(`📶 Ping OK=${pingOk}, latency=${latencyMs}ms`);

      // 2) Exempel-features för ML (ersätt med riktiga data)
      const features = {
        lp_size: 100,
        initial_burn: 5,
        mint_authority_burned: 1,
        time_since_init: 1.2,
        early_buy_count: 0,
        early_sell_count: 0,
        early_buy_sell_ratio: 0,
      };

      // 3) Hämta ML-score
      const score = ml.predict(features);
      console.log(`🤖 ML-score: ${score.toFixed(3)}`);

      // 4) Beslut & bundle-sändning
      if (score >= 0.8) {
        const sender = new BundleSender({
          endpoint:
            process.env.JITO_ENDPOINT || "https://postman-echo.com/post",
          authToken: process.env.JITO_AUTH_TOKEN || "uuid-1234",
        });
        const sent = await sender.sendBundle({ slot, dummy: true });
        console.log(`📦 Bundle skickad: ${sent}`);
      } else {
        console.log("⚠️ Score under threshold, avbryter.");
      }
    }
  );

  // Starta WebSocket-prenumeration
  await listener.start();
}

// Om filen körs direkt via `node dist/index.js`
if (require.main === module) {
  main().catch((err) => {
    console.error("⚠️ Fatal error i orchestrator:", err);
    process.exit(1);
  });
}

export { main };

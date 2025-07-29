// src/ts/index.ts

import { StreamListener } from "./services/streamListener";
import { measureLatency } from "./utils/latency";
import { BundleSender } from "./services/bundleSender";

async function main() {
  // 1) Starta listener
  const listener = new StreamListener("https://your-chainstack-endpoint", async (slot) => {
    console.log(`Ny slot: ${slot}`);

    // 2) Mät RTT mot Jito-endpoint (stub)
    const { result: pingOk, latencyMs } = await measureLatency(async () => {
      // Här kan du köra en liten fetch mot Jito eller annan stub
      return true;
    });
    console.log(`Ping OK=${pingOk}, latency=${latencyMs}ms`);

    // 3) Skicka ett dummy-bundle
    const sender = new BundleSender({
      endpoint: "https://jito.example/sendBundle",
      authToken: "uuid-1234",
    });
    const sent = await sender.sendBundle({ slot, dummy: true });
    console.log(`Bundle skickad: ${sent}`);
  });

  await listener.start(500);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error i main:", err);
    process.exit(1);
  });
}

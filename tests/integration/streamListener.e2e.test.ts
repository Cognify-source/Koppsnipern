// tests/integration/streamListener.e2e.test.ts

import { StreamListener } from "../../src/ts/services/streamListener";

describe("StreamListener WebSocket E2E (Devnet)", () => {
  it(
    "ska ta emot minst två slot-uppdateringar från devnet",
    (done) => {
      // Använd HTTP(S)-endpoint – Connection accepterar inte wss:// direkt
      const url =
        process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
      const received: number[] = [];

      // Starta en timeout så vi inte väntar för evigt
      const timer = setTimeout(() => {
        listener.stop();
        done(new Error("Timeout: inga slots inom 15 s"));
      }, 15000);

      const listener = new StreamListener(url, (slot) => {
        received.push(slot);

        if (received.length >= 2) {
          // Rensa timern och prenumerationen
          clearTimeout(timer);
          listener.stop();
          try {
            expect(received[0]).toBeGreaterThan(0);
            expect(received[1]).toBeGreaterThan(received[0]);
            done();
          } catch (err) {
            done(err as Error);
          }
        }
      });

      // Starta prenumerationen; om det kraschar vill vi också städa upp timern
      listener
        .start()
        .catch((err) => {
          clearTimeout(timer);
          done(err);
        });
    },
    20000
  );
});

// tests/integration/orchestrator.test.ts

import { spawn } from "child_process";
import path from "path";

describe("Orchestrator E2E", () => {
  const bin = path.resolve(__dirname, "../../dist/index.js");

  beforeAll((done) => {
    const build = spawn("npm", ["run", "build"], { shell: true });
    build.on("exit", (code) => {
      if (code !== 0) return done(new Error("Build misslyckades"));
      done();
    });
  }, 60000);

  it(
    "ska logga slot, ping och bundle",
    (done) => {
      const proc = spawn("node", [bin], {
        env: {
          ...process.env,
          SOLANA_RPC_URL: "https://api.devnet.solana.com",
          // Här pekar vi mot en publik echo-server för test
          JITO_ENDPOINT: "https://postman-echo.com/post",
          JITO_AUTH_TOKEN: "test-token",
        },
        shell: true,
      });

      let output = "";
      let finished = false;

      const handleSuccess = () => {
        if (!finished) {
          finished = true;
          proc.kill();
          done();
        }
      };

      const handleFailure = (msg: string) => {
        if (!finished) {
          finished = true;
          proc.kill();
          done(new Error(msg));
        }
      };

      proc.stdout.on("data", (data) => {
        output += data.toString();
        if (
          output.includes("Ny slot:") &&
          output.includes("Ping OK=") &&
          output.includes("Bundle skickad:")
        ) {
          if (output.includes("Bundle skickad: true")) {
            handleSuccess();
          } else {
            handleFailure("Bundle skickad: true saknas");
          }
        }
      });

      proc.stderr.on("data", (err) => {
        // Vi kan tysta nätverks-errors från fetch:
        /* no-op */
      });

      proc.on("exit", () => {
        if (!finished) {
          handleFailure("Processen avslutades innan förväntade loggar dök upp");
        }
      });
    },
    30000
  );
});

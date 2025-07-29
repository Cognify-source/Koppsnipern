// tests/integration/orchestrator.test.ts

import { spawn } from "child_process";
import path from "path";

describe("Orchestrator E2E", () => {
  it("ska logga slot, ping och bundle", (done) => {
    const bin = path.resolve(__dirname, "../../dist/index.js");
    const p = spawn("node", [bin]);

    let output = "";
    p.stdout.on("data", (data) => {
      output += data.toString();
      if (output.includes("Ny slot:") 
          && output.includes("Ping OK=") 
          && output.includes("Bundle skickad:")) {
        p.kill();
        done();
      }
    });

    p.stderr.on("data", (err) => {
      console.error(err.toString());
    });

    p.on("exit", () => {
      if (!output.includes("Bundle skickad: true")) {
        done.fail("Förväntad bundle-loggning saknades");
      }
    });
  }, 20000);
});

"use strict";
// tests/integration/orchestrator.test.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
describe("Orchestrator E2E (stub-mode)", () => {
    const bin = path_1.default.resolve(__dirname, "../../dist/index.js");
    beforeAll((done) => {
        // Bygg koden innan testet
        const build = (0, child_process_1.spawn)("npm", ["run", "build"], { shell: true });
        build.on("exit", (code) => {
            if (code !== 0)
                return done(new Error("Build misslyckades"));
            done();
        });
    }, 60000);
    it("ska logga två stub-slots, ping och bundle", (done) => {
        const stubSlots = [101, 102];
        const proc = (0, child_process_1.spawn)("node", [bin], {
            env: {
                ...process.env,
                USE_STUB: "true",
                STUB_SLOTS: JSON.stringify(stubSlots),
                JITO_ENDPOINT: "https://postman-echo.com/post",
                JITO_AUTH_TOKEN: "test-token",
            },
            shell: true,
        });
        let output = "";
        const timer = setTimeout(() => {
            proc.kill();
            done(new Error("Timeout: inga förväntade loggar inom 5s"));
        }, 5000);
        proc.stdout.on("data", (data) => {
            output += data.toString();
            const ok = stubSlots.every((s) => output.includes(`Ny slot: ${s}`)) &&
                output.includes("📶 Ping OK=") &&
                output.includes("📦 Bundle skickad: true");
            if (ok) {
                clearTimeout(timer);
                proc.kill();
                done();
            }
        });
        proc.stderr.on("data", () => {
            /* no-op */
        });
    }, 10000);
});

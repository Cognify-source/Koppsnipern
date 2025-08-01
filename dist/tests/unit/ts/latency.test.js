"use strict";
// tests/unit/ts/latency.test.ts
Object.defineProperty(exports, "__esModule", { value: true });
const latency_1 = require("../../../src/ts/utils/latency");
describe("measureLatency", () => {
    it("ska returnera funktionen resultat och en rimlig latency", async () => {
        // Stub: en funktion som väntar 50 ms och sedan returnerar "ok"
        const fakeFn = jest.fn(async () => {
            return new Promise((res) => setTimeout(() => res("ok"), 50));
        });
        const { result, latencyMs } = await (0, latency_1.measureLatency)(fakeFn);
        expect(result).toBe("ok");
        expect(latencyMs).toBeGreaterThanOrEqual(45);
        expect(latencyMs).toBeLessThanOrEqual(200);
        expect(fakeFn).toHaveBeenCalled();
    });
});

"use strict";
// src/ts/utils/latency.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.measureLatency = void 0;
/**
 * Mätningsfunktion för round-trip-time (RTT).
 * Anropar en async-funktion och mäter hur lång tid det tar i ms.
 *
 * @param fn – en asynkron funktion att köra
 * @returns {Promise<{ result: T; latencyMs: number }>}
 */
async function measureLatency(fn) {
    const t0 = performance.now();
    const result = await fn();
    const t1 = performance.now();
    return {
        result,
        latencyMs: Math.round(t1 - t0),
    };
}
exports.measureLatency = measureLatency;

// src/ts/utils/latency.ts

/**
 * Mätningsfunktion för round-trip-time (RTT).
 * Anropar en async-funktion och mäter hur lång tid det tar i ms.
 * 
 * @param fn – en asynkron funktion att köra
 * @returns {Promise<{ result: T; latencyMs: number }>}
 */
export async function measureLatency<T>(fn: () => Promise<T>): Promise<{
  result: T;
  latencyMs: number;
}> {
  const t0 = performance.now();
  const result = await fn();
  const t1 = performance.now();
  return {
    result,
    latencyMs: Math.round(t1 - t0),
  };
}

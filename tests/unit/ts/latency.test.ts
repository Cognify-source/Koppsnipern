// tests/unit/ts/latency.test.ts

import { measureLatency } from "../../../src/ts/utils/latency";

describe("measureLatency", () => {
  it("ska returnera funktionen resultat och en rimlig latency", async () => {
    // Stub: en funktion som väntar 50 ms och sedan returnerar "ok"
    const fakeFn = jest.fn(async () => {
      return new Promise<string>((res) => setTimeout(() => res("ok"), 50));
    });

    const { result, latencyMs } = await measureLatency(fakeFn);

    expect(result).toBe("ok");
    expect(latencyMs).toBeGreaterThanOrEqual(45);
    expect(latencyMs).toBeLessThanOrEqual(200); 
    expect(fakeFn).toHaveBeenCalled();
  });
});

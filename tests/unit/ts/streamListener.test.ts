// tests/unit/ts/dexPoolListener.test.ts

import { DexPoolListener, NewPoolCallback, PoolData } from "../../../src/ts/listeners/dexPoolListener";

// Mock för newPoolCallback
const mockNewPoolCallback = jest.fn();

// Mock för PumpV1Listener
jest.mock("../../../src/ts/listeners/sources/pumpV1Listener", () => {
  return {
    PumpV1Listener: jest.fn().mockImplementation((callback: NewPoolCallback) => ({
      start: jest.fn().mockResolvedValue(undefined),
      constructor: { name: 'PumpV1Listener' }
    }))
  };
});

describe("DexPoolListener", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("ska skapa en DexPoolListener med callback", () => {
    const listener = new DexPoolListener(mockNewPoolCallback);
    expect(listener).toBeInstanceOf(DexPoolListener);
  });

  it("ska starta alla registrerade listeners", async () => {
    const listener = new DexPoolListener(mockNewPoolCallback);
    
    // Mock console.log för att undvika output under test
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    await listener.start();
    
    // Kontrollera att console.log anropades för att visa att listeners startades
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DEX_MANAGER] Initializing'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DEX_MANAGER] All listeners have been started.'));
    
    consoleSpy.mockRestore();
  });

  it("ska hantera fel när en listener misslyckas att starta", async () => {
    // Mock en listener som kastar fel
    const { PumpV1Listener } = require("../../../src/ts/listeners/sources/pumpV1Listener");
    PumpV1Listener.mockImplementation((callback: NewPoolCallback) => ({
      start: jest.fn().mockRejectedValue(new Error("Test error")),
      constructor: { name: 'PumpV1Listener' }
    }));

    const listener = new DexPoolListener(mockNewPoolCallback);
    
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    await listener.start();
    
    // Kontrollera att fel loggades
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEX_MANAGER] Error starting listener'),
      expect.any(Error)
    );
    
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

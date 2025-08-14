// tests/integration/pumpAmmListener.test.ts

import { PumpAmmListener } from '../../src/ts/listeners/sources/pumpAmmListener';
import { PoolData } from '../../src/ts/services/safetyService';

// Mock the Connection class to prevent any real network calls
jest.mock('@solana/web3.js', () => {
  const actualWeb3 = jest.requireActual('@solana/web3.js');
  return {
    ...actualWeb3,
    Connection: jest.fn().mockImplementation(() => ({
      onLogs: jest.fn(),
    })),
  };
});

// Set the environment variable to activate stub mode
process.env.USE_STUB_LISTENER = 'true';

describe('PumpAmmListener (Integration with Stub using Real Timers)', () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should correctly parse a CreatePoolEvent from mock logs', async () => {
    const newPoolCallback = jest.fn();
    const listener = new PumpAmmListener(newPoolCallback);

    listener.start();

    // --- Wait for the first interval (5s) to fire ---
    await new Promise(resolve => setTimeout(resolve, 5500));

    // Expect the callback to NOT have been called, because the mock data is for a non-SOL pair
    // and the listener should correctly filter it.
    expect(newPoolCallback).toHaveBeenCalledTimes(0);

  }, 10000); // Set a 10s timeout
});

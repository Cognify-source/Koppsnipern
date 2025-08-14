// tests/integration/pumpV1Listener.test.ts

import { PumpV1Listener } from '../../src/ts/listeners/sources/pumpV1Listener';
import { PoolData } from '../../src/ts/services/safetyService';

// Mock the Connection class to prevent any real network calls, which can cause hangs.
jest.mock('@solana/web3.js', () => {
  const actualWeb3 = jest.requireActual('@solana/web3.js');
  return {
    ...actualWeb3,
    Connection: jest.fn().mockImplementation(() => ({
      getParsedTransaction: jest.fn().mockResolvedValue(null),
      onLogs: jest.fn(),
    })),
  };
});

// Set the environment variable to activate stub mode
process.env.USE_STUB_LISTENER = 'true';
// Suppress console logs from the module during the test
jest.spyOn(console, 'log').mockImplementation(() => {});

// This test uses REAL timers to avoid issues with jest's fake timers and async operations.
describe('PumpV1Listener (Integration with Stub using Real Timers)', () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should call the new pool callback with mock data from the stub implementation', async () => {
    const newPoolCallback = jest.fn();
    const listener = new PumpV1Listener(newPoolCallback);

    listener.start();

    // --- Wait for the first interval (5s) to fire ---
    await new Promise(resolve => setTimeout(resolve, 5500)); // Wait 5.5s to be safe

    // Expect the callback to have been called once
    expect(newPoolCallback).toHaveBeenCalledTimes(1);
    const expectedSafePool: Partial<PoolData> = {
      source: 'stub-safe',
      lpSol: 25,
    };
    expect(newPoolCallback).toHaveBeenCalledWith(
      expect.objectContaining(expectedSafePool)
    );

    // --- Wait for the second interval (5s) to fire ---
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait another 5s

    // Expect the callback to have been called a second time
    expect(newPoolCallback).toHaveBeenCalledTimes(2);
    const expectedBlockedPool: Partial<PoolData> = {
      source: 'stub-blocked',
      mintAuthority: 'SOME_AUTHORITY_KEY',
    };
    expect(newPoolCallback).toHaveBeenLastCalledWith(
      expect.objectContaining(expectedBlockedPool)
    );
  }, 20000); // Set a long timeout to accommodate real delays
});

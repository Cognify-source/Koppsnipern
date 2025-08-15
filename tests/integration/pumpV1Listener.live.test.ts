import { Connection, ParsedTransactionWithMeta, PublicKey, LAMPORTS_PER_SOL, Logs } from '@solana/web3.js';
import { PumpV1Listener } from '../../src/ts/listeners/sources/pumpV1Listener';
import { NewPoolCallback } from '../../src/ts/listeners/iPoolListener';
import { PoolData } from '../../src/ts/services/safetyService';

// This is a more robust way to mock and capture the onLogs callback
let capturedOnLogsCallback: (log: Logs, context: any) => void;

jest.mock('@solana/web3.js', () => {
  const actualWeb3 = jest.requireActual('@solana/web3.js');
  return {
    ...actualWeb3,
    Connection: jest.fn().mockImplementation(() => ({
      getParsedTransactions: jest.fn(),
      onLogs: jest.fn((programId, callback) => {
        capturedOnLogsCallback = callback; // Capture the callback when onLogs is called
      }),
    })),
  };
});

// Mock the notify service to prevent actual discord calls during tests
jest.mock('../../src/ts/services/notifyService', () => ({
  notifyDiscord: jest.fn(),
  logSafePool: jest.fn(),
  logBlockedPool: jest.fn(),
}));

describe('PumpV1Listener - Live Mode with Batching', () => {
  let listener: PumpV1Listener;
  let mockCallback: jest.Mock<NewPoolCallback>;
  let mockConnection: jest.Mocked<Connection>;

  beforeAll(() => {
    process.env.USE_STUB_LISTENER = 'false';
    process.env.SOLANA_WSS_RPC_URL = 'wss://dummy.url';
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    mockCallback = jest.fn();
    listener = new PumpV1Listener(mockCallback);

    mockConnection = (listener as any)._httpConnection as jest.Mocked<Connection>;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should queue signatures and process them in a batch', async () => {
    const MOCK_PUMP_V1_TRANSACTION: ParsedTransactionWithMeta = {
      blockTime: 123456789,
      slot: 1234,
      meta: {
        err: null,
        fee: 5000,
        innerInstructions: [],
        preBalances: [],
        postBalances: [],
        preTokenBalances: [],
        postTokenBalances: [],
        logMessages: [],
      },
      transaction: {
        message: {
          accountKeys: [
            { pubkey: new PublicKey("C4udGwTg6oqcrr8SmSLmkcXDbaFEcopsiaT21KUE4psU"), signer: true, writable: true, source: 'transaction' },
            { pubkey: new PublicKey("BeN5kwHbBLL3YYeZS5Z9yqPdp1xPQE9wwC91ECoVpump"), signer: true, writable: true, source: 'transaction' },
            { pubkey: new PublicKey("HDxg3qJqAexLtP4HJ2jkqgNVuvmFyTd5KGoK5K83i9MC"), signer: false, writable: true, source: 'transaction' },
          ],
          instructions: [
            { programId: new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"), accounts: [], data: '' } as any
          ],
          recentBlockhash: 'test-blockhash',
        },
        signatures: ['2HPk4pgfRezwJ7bPMwpfCErMHbFhAVCzipx9tzAmXsayyD46s8cY1ArLAzMohp8Rubz52oCdHG92iP8UAUXmsCyx'],
      },
      version: 0,
    };

    const txSignature = MOCK_PUMP_V1_TRANSACTION.transaction.signatures[0];

    listener.start();

    // Ensure onLogs was called and we captured the callback
    expect(capturedOnLogsCallback).toBeDefined();

    // Simulate two logs arriving
    capturedOnLogsCallback({ signature: txSignature, err: null, logs: [] }, {} as any);
    capturedOnLogsCallback({ signature: 'anotherFailedSignature', err: null, logs: [] }, {} as any);

    expect(mockConnection.getParsedTransactions).not.toHaveBeenCalled();
    expect(mockCallback).not.toHaveBeenCalled();

    (mockConnection.getParsedTransactions as jest.Mock).mockResolvedValue([MOCK_PUMP_V1_TRANSACTION, null]);

    await jest.advanceTimersByTimeAsync(250);

    expect(mockConnection.getParsedTransactions).toHaveBeenCalledTimes(1);
    expect(mockConnection.getParsedTransactions).toHaveBeenCalledWith([txSignature, 'anotherFailedSignature'], expect.any(Object));

    expect(mockCallback).toHaveBeenCalledTimes(1);
    const expectedPoolData: Partial<PoolData> = {
      address: 'HDxg3qJqAexLtP4HJ2jkqgNVuvmFyTd5KGoK5K83i9MC',
      mint: 'BeN5kwHbBLL3YYeZS5Z9yqPdp1xPQE9wwC91ECoVpump',
      source: 'PumpV1',
    };
    expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining(expectedPoolData));
  });
});

import { Connection, PublicKey, Logs, clusterApiUrl } from '@solana/web3.js';
import { PoolData } from '../../services/safetyService';
import { IPoolListener, NewPoolCallback } from '../iPoolListener';
import * as mockPoolEvents from '../../../../tests/integration/data/mock-pool-events.json';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export class PumpV1Listener implements IPoolListener {
  private _httpConnection: Connection;
  private _wsConnection: Connection | null = null;
  private _onNewPool: NewPoolCallback;
  private _useStubListener: boolean;

  constructor(callback: NewPoolCallback) {
    this._onNewPool = callback;
    this._useStubListener = process.env.USE_STUB_LISTENER === 'true';

    const httpRpcUrl =
      process.env.SOLANA_HTTP_RPC_URL?.startsWith('http')
        ? process.env.SOLANA_HTTP_RPC_URL
        : clusterApiUrl('mainnet-beta');
    this._httpConnection = new Connection(httpRpcUrl, 'confirmed');

    if (!this._useStubListener) {
      const wssRpcUrl = process.env.SOLANA_WSS_RPC_URL?.startsWith('ws')
        ? process.env.SOLANA_WSS_RPC_URL
        : undefined;

      if (!wssRpcUrl) {
        throw new Error('SOLANA_WSS_RPC_URL must be set in .env for live mode.');
      }
      this._wsConnection = new Connection(httpRpcUrl, {
        commitment: 'confirmed',
        wsEndpoint: wssRpcUrl,
      } as any);
    }
  }

  public start() {
    console.log(`[PUMP_V1] Starting listener... ${this._useStubListener ? '(stub-mode)' : '(live-mode)'}`);

    if (this._useStubListener) {
      this._startStubListener();
    } else {
      this._startLiveListener();
    }
  }

  private _startStubListener() {
    console.log('[PUMP_V1_STUB] Reading mock pool events from file...');
    let eventIndex = 0;
    setInterval(() => {
      if (eventIndex >= mockPoolEvents.length) {
        console.log('[PUMP_V1_STUB] All mock events processed. Resetting.');
        eventIndex = 0;
      }
      const mockLog = mockPoolEvents[eventIndex];
      console.log(`[PUMP_V1_STUB] Processing mock event #${eventIndex + 1}: ${mockLog.signature}`);
      this._processLog(mockLog);
      eventIndex++;
    }, 5000);
  }

  private _startLiveListener() {
    if (!this._wsConnection) {
      throw new Error('WebSocket connection is not available for live mode.');
    }
    const pumpV1ProgramId = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
    console.log(`[PUMP_V1_LIVE] Listening for logs from Pump.fun V1 program: ${pumpV1ProgramId.toBase58()}`);
    this._wsConnection.onLogs(pumpV1ProgramId, log => this._processLog(log));
  }

  private async _processLog(log: Logs | any) {
    const poolData = await this._extractPoolDataFromLog(log);
    if (poolData) {
      console.log(`[PUMP_V1_LISTENER] New potential pool found: ${poolData.address}. Passing to orchestrator.`);
      this._onNewPool(poolData);
    }
  }

  private async _extractPoolDataFromLog(log: any): Promise<PoolData | null> {
    if (this._useStubListener) {
      console.log(`[STUB_EXTRACT] Creating mock pool data for ${log.signature}`);
      if (log.signature === 'MOCK_PUMPV1_POOL_SUCCESS') {
        // This pool is designed to PASS the safety checks
        return {
          address: 'So11111111111111111111111111111111111111112', // Valid public key
          mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Valid public key
          source: 'stub-safe',
          mintAuthority: null,
          freezeAuthority: null,
          lpSol: 25, // check: > 10 SOL
          creatorFee: 3, // check: < 5 %
          estimatedSlippage: 1, // check: < 3 %
          creator: 'SafeCreator',
        };
      } else {
        // This pool is designed to FAIL the safety checks
        return {
          address: '11111111111111111111111111111111', // Valid public key
          mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Valid public key
          source: 'stub-blocked',
          mintAuthority: 'SOME_AUTHORITY_KEY', // This will cause the check to fail
          freezeAuthority: null,
          lpSol: 50,
          creatorFee: 2,
          estimatedSlippage: 1,
          creator: 'BlockedCreator',
        };
      }
    }

    // Live logic
    if (!log.signature) return null;

    try {
      const tx = await this._httpConnection.getParsedTransaction(log.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx || !tx.meta) return null;

      // The primary indicator for a new Pump.fun V1 pool.
      const isNewPumpV1Pool = (tx.meta.preTokenBalances?.length ?? -1) === 0;
      const isPumpV1Program = tx.transaction.message.instructions.some(ix => ix.programId.toBase58() === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

      if (isNewPumpV1Pool && isPumpV1Program) {
        console.log(`[EXTRACT] Identified new Pump.fun V1 pool. Signature: ${log.signature}`);

        const accountKeys = tx.transaction.message.accountKeys;
        const bondingCurveAddress = accountKeys[2].pubkey.toBase58();
        const tokenMintAddress = accountKeys[1].pubkey.toBase58();

        // Check if mint authority was revoked.
        let mintAuthorityRevoked = false;
        tx.meta.innerInstructions?.forEach(ix => {
          ix.instructions.forEach(iix => {
            if ('parsed' in iix && iix.program === 'spl-token' && iix.parsed.type === 'setAuthority') {
              const parsedIx = iix.parsed.info;
              if (parsedIx.authorityType === 'mintTokens' && parsedIx.newAuthority === null) {
                mintAuthorityRevoked = true;
              }
            }
          });
        });

        // Find the largest SOL deposit to the bonding curve, which represents the initial liquidity.
        let maxLpSol = 0;
        tx.meta.innerInstructions?.forEach(ix => {
          ix.instructions.forEach(iix => {
            if ('parsed' in iix && iix.program === 'system' && iix.parsed.type === 'transfer') {
              const parsedIx = iix.parsed.info;
              if (parsedIx.destination === bondingCurveAddress) {
                if (parsedIx.lamports > maxLpSol) {
                  maxLpSol = parsedIx.lamports;
                }
              }
            }
          });
        });
        const initialLpSol = maxLpSol;

        return {
          address: bondingCurveAddress,
          mint: tokenMintAddress,
          source: 'PumpV1',
          mintAuthority: mintAuthorityRevoked ? null : 'UNKNOWN', // Set to a non-null value if not revoked
          freezeAuthority: null, // Pump.fun tokens typically don't have a freeze authority.
          lpSol: initialLpSol / 1e9, // Convert lamports to SOL
          // NOTE: Creator fee and slippage are complex to extract without an Anchor IDL.
          // Leaving as 0 for now, as the primary goal is detection and core data logging.
          creatorFee: 0,
          estimatedSlippage: 0,
          creator: tx.transaction.message.accountKeys[0].pubkey.toBase58(),
        };
      }
    } catch (error) {
      console.error(`[EXTRACT] Error processing transaction ${log.signature}:`, error);
    }

    return null;
  }
}

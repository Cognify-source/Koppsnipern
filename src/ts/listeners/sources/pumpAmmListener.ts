import { Connection, PublicKey, Logs, clusterApiUrl, ParsedTransactionWithMeta } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { PoolData } from '../../services/safetyService';
import { IPoolListener, NewPoolCallback } from '../iPoolListener';
import { ConnectionManager } from '../../utils/connectionManager';
import * as mockPoolEvents from '../../../../tests/integration/data/mock-pump-amm-events.json';
import * as dotenv from 'dotenv';

dotenv.config();

export class PumpAmmListener implements IPoolListener {
  private _httpConnection: Connection;
  private _wsConnection: Connection;
  private _onNewPool: NewPoolCallback;
  private _programId: PublicKey;
  private _signatureQueue: string[] = [];

  constructor(callback: NewPoolCallback) {
    this._onNewPool = callback;
    this._programId = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
    
    // Use shared connections to reduce RPC overhead
    this._httpConnection = ConnectionManager.getHttpConnection();
    this._wsConnection = ConnectionManager.getWsConnection();
  }

  public async start() {
    console.log(`[PUMP_AMM] Starting listener... (live-mode only)`);
    this._startLiveListener();
    // Use configurable delay from environment variable
    const rpcDelayMs = parseInt(process.env.RPC_DELAY_MS || '1500', 10);
    console.log(`[PUMP_AMM] Using RPC delay: ${rpcDelayMs}ms`);
    setInterval(() => this._processSignatureQueue(), rpcDelayMs);
  }

  private _startLiveListener() {
    if (!this._wsConnection) {
      throw new Error('WebSocket connection is not available for live mode.');
    }
    console.log(`[PUMP_AMM_LIVE] Listening for logs from Pump.fun AMM program: ${this._programId.toBase58()}`);
    this._wsConnection.onLogs(this._programId, (log) => {
      if (!log.err) {
        this._signatureQueue.push(log.signature);
      }
    });
  }

  private async _processSignatureQueue() {
    if (this._signatureQueue.length === 0) {
      return;
    }

    // Limit batch size to reduce RPC load and avoid rate limits
    const maxBatchSize = 10;
    const signatures = this._signatureQueue.splice(0, Math.min(maxBatchSize, this._signatureQueue.length));

    try {
      // Track RPC request
      ConnectionManager.trackRequest();
      
      const txs = await this._httpConnection.getParsedTransactions(signatures, {
        maxSupportedTransactionVersion: 0,
      });

      for (const tx of txs) {
        if (tx) {
          const poolData = await this._extractPoolDataFromTransaction(tx);
          if (poolData) {
            console.log(`[PUMP_AMM_LISTENER] New potential pool found: ${poolData.address}. Passing to orchestrator.`);
            this._onNewPool(poolData);
          }
        }
      }
    } catch (error) {
      console.error('[PUMP_AMM_QUEUE] Error fetching or processing transactions in batch:', error);
    }
  }

  private async _extractPoolDataFromTransaction(tx: ParsedTransactionWithMeta): Promise<PoolData | null> {
    const signature = tx.transaction.signatures[0];
    if (!signature) return null;

    try {
      if (!tx.meta || !tx.meta.logMessages) return null;

      // Look for PumpAMM CreatePool event in logs
      const eventPrefix = 'Program data: ';
      const eventLog = tx.meta.logMessages.find(l => l.startsWith(eventPrefix));

      if (eventLog) {
        const base64Data = eventLog.substring(eventPrefix.length);
        const dataBuffer = Buffer.from(base64Data, 'base64');

        // First 8 bytes are the event discriminator, skip them
        const eventDataBuffer = dataBuffer.slice(8);

        const poolData = this._parseCreatePoolEvent(eventDataBuffer);
        if (poolData) {
          // Additional validation for PumpAMM pools
          const isPumpAmmProgram = tx.transaction.message.instructions.some((ix: any) => 
            ix.programId.toBase58() === this._programId.toBase58()
          );

          if (isPumpAmmProgram) {
            return poolData;
          }
        }
      }
    } catch (error) {
      console.error(`[PUMP_AMM_EXTRACT] Error processing transaction ${signature}:`, error);
    }

    return null;
  }

  private _startStubListener(): void {
    console.log('[PUMP_AMM_STUB] Starting stub listener...');
    let eventIndex = 0;
    setInterval(() => {
      if (eventIndex >= mockPoolEvents.length) {
        console.log('[PUMP_AMM_STUB] All mock events processed. Resetting.');
        eventIndex = 0;
      }
      const mockLog = mockPoolEvents[eventIndex];
      this._processLog(mockLog as Logs);
      eventIndex++;
    }, 5000);
  }

  private _parseCreatePoolEvent(dataBuffer: Buffer): PoolData | null {
    try {
      let offset = 0;

      // Skip timestamp and index for now as they aren't used in PoolData
      offset += 8; // i64
      offset += 2; // u16

      const creator = new PublicKey(dataBuffer.slice(offset, offset + 32));
      offset += 32;
      const baseMint = new PublicKey(dataBuffer.slice(offset, offset + 32));
      offset += 32;
      const quoteMint = new PublicKey(dataBuffer.slice(offset, offset + 32));
      offset += 32;

      // Check if the pool is a SOL pair
      const wsolMint = 'So11111111111111111111111111111111111111112';
      if (quoteMint.toBase58() !== wsolMint) {
        return null;
      }

      offset += 1; // base_mint_decimals (u8)
      offset += 1; // quote_mint_decimals (u8)
      offset += 8; // base_amount_in (u64)

      const quoteAmountIn = dataBuffer.readBigUInt64LE(offset);
      offset += 8;

      // Skip unused fields until we get to the ones we need
      offset += 8; // pool_base_amount
      offset += 8; // pool_quote_amount
      offset += 8; // minimum_liquidity
      offset += 8; // initial_liquidity
      offset += 8; // lp_token_amount_out
      offset += 1; // pool_bump

      const pool = new PublicKey(dataBuffer.slice(offset, offset + 32));

      const poolData: PoolData = {
        address: pool.toBase58(),
        mint: baseMint.toBase58(),
        lpSol: Number(quoteAmountIn) / 1e9, // Convert lamports to SOL
        creator: creator.toBase58(),
        source: 'PumpAMM',
        mintAuthority: null,
        freezeAuthority: null,
        creatorFee: 0,
        estimatedSlippage: 0,
      };

      return poolData;

    } catch (error) {
      console.error('[PUMP_AMM] Error manually parsing event:', error);
      return null;
    }
  }

  private _processLog(log: Logs) {
    const eventPrefix = 'Program data: ';
    const eventLog = log.logs.find(l => l.startsWith(eventPrefix));

    if (eventLog) {
      const base64Data = eventLog.substring(eventPrefix.length);
      const dataBuffer = Buffer.from(base64Data, 'base64');

      // First 8 bytes are the event discriminator, skip them
      const eventDataBuffer = dataBuffer.slice(8);

      const poolData = this._parseCreatePoolEvent(eventDataBuffer);
      if (poolData) {
        console.log(`[PUMP_AMM] Detected and parsed CreatePoolEvent in tx: ${log.signature}`);
        this._onNewPool(poolData);
      }
    }
  }
}

import { Connection, PublicKey, Logs, clusterApiUrl } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { PoolData } from '../../services/safetyService';
import { IPoolListener, NewPoolCallback } from '../iPoolListener';
import * as mockPoolEvents from '../../../../tests/integration/data/mock-pump-amm-events.json';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export class PumpAmmListener implements IPoolListener {
  private _connection: Connection | undefined;
  private _wsConnection: Connection | null = null;
  private _onNewPool: NewPoolCallback;
  private _programId: PublicKey;

  constructor(callback: NewPoolCallback) {
    this._onNewPool = callback;
    this._programId = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');

    const httpRpcUrl = process.env.SOLANA_HTTP_RPC_URL || clusterApiUrl('mainnet-beta');
    this._connection = new Connection(httpRpcUrl, 'confirmed');
    const wssRpcUrl = process.env.SOLANA_WSS_RPC_URL;
    if (wssRpcUrl) {
      this._wsConnection = new Connection(httpRpcUrl, {
        commitment: 'confirmed',
        wsEndpoint: wssRpcUrl,
      });
    }
  }

  public start(): void {
    if (!this._wsConnection) {
      console.log('[PUMP_AMM] Not started, WebSocket connection is missing.');
      return;
    }

    console.log(`[PUMP_AMM] Listening for logs from program: ${this._programId.toBase58()}`);
    this._wsConnection.onLogs(this._programId, (log) => this._processLog(log), 'confirmed');
  }

  /*
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
  */

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

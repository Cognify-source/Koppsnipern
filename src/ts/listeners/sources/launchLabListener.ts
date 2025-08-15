import { Connection, PublicKey, Logs, clusterApiUrl, ParsedInstruction } from '@solana/web3.js';
import { PoolData } from '../../services/safetyService';
import { IPoolListener, NewPoolCallback } from '../iPoolListener';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export class LaunchLabListener implements IPoolListener {
  private _connection: Connection;
  private _wsConnection: Connection | null = null;
  private _onNewPool: NewPoolCallback;
  private _programId: PublicKey;

  constructor(callback: NewPoolCallback) {
    this._onNewPool = callback;
    this._programId = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');

    const httpRpcUrl = process.env.SOLANA_HTTP_RPC_URL || clusterApiUrl('mainnet-beta');
    this._connection = new Connection(httpRpcUrl, 'confirmed');
    const wssRpcUrl = process.env.SOLANA_WSS_RPC_URL;

    if (process.env.USE_STUB_LISTENER !== 'true' && wssRpcUrl) {
      this._wsConnection = new Connection(httpRpcUrl, {
        commitment: 'confirmed',
        wsEndpoint: wssRpcUrl,
      });
    }
  }

  public start(): void {
    // if (process.env.USE_STUB_LISTENER === 'true') {
    //   // Stub mode is not implemented for this listener yet.
    //   return;
    // }

    if (!this._wsConnection) {
      console.log('[LAUNCHLAB] Not started, WebSocket connection is missing.');
      return;
    }

    console.log(`[LAUNCHLAB] Listening for logs from program: ${this._programId.toBase58()}`);
    this._wsConnection.onLogs(this._programId, (log) => this._processLog(log), 'confirmed');
  }

  private async _processLog(log: Logs) {
    // Check for the specific event string in the logs
    const eventSignature = 'Program log: Instruction: CreatePool';
    const hasEvent = log.logs.some(l => l.includes(eventSignature));

    if (hasEvent) {
      console.log(`[LAUNCHLAB] Detected PoolCreateEvent in transaction: ${log.signature}`);
      try {
        const tx = await this._connection.getParsedTransaction(log.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx || !tx.meta) {
          return;
        }

        // Find the instruction sent to our program
        const createInstruction = tx.transaction.message.instructions.find(
          ix => ix.programId.toBase58() === this._programId.toBase58()
        );

        if (!createInstruction || !('accounts' in createInstruction)) {
          return;
        }

        // From the user's data: #6 is Pool State, #7 is Base Mint
        const poolStateAccount = createInstruction.accounts[5];
        const baseMintAccount = createInstruction.accounts[6];
        const creatorAccount = createInstruction.accounts[1];

        if (!poolStateAccount || !baseMintAccount || !creatorAccount) {
            return;
        }

        const poolData: PoolData = {
          address: poolStateAccount.toBase58(),
          mint: baseMintAccount.toBase58(),
          creator: creatorAccount.toBase58(),
          source: 'LaunchLab',
          // These fields are not available from this event/tx structure
          lpSol: 0,
          mintAuthority: null,
          freezeAuthority: null,
          creatorFee: 0,
          estimatedSlippage: 0,
        };

        this._onNewPool(poolData);

      } catch (error) {
        console.error(`[LAUNCHLAB] Error processing transaction ${log.signature}:`, error);
      }
    }
  }
}

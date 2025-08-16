import { Connection, clusterApiUrl, ParsedTransactionWithMeta } from '@solana/web3.js';

// Global RPC request queue types
interface RpcRequest {
  id: string;
  type: 'getParsedTransactions' | 'getSlot' | 'getMultipleAccountsInfo' | 'getAccountInfo' | 'getLatestBlockhash' | 'confirmTransaction';
  params: any[];
  resolve: (result: any) => void;
  reject: (error: any) => void;
  source: string; // For debugging which component made the request
}

/**
 * Shared connection manager with global RPC queue to prevent rate limiting
 * All RPC requests go through a single queue with controlled timing
 */
class ConnectionManager {
  private static _httpConnection: Connection | null = null;
  private static _wsConnection: Connection | null = null;
  private static _requestCount: number = 0;
  private static _requestTimes: number[] = [];
  private static _lastRpsReport: number = Date.now();
  
  // Global RPC queue
  private static _rpcQueue: RpcRequest[] = [];
  private static _isProcessingQueue: boolean = false;
  private static _queueProcessor: NodeJS.Timeout | null = null;

  public static getHttpConnection(): Connection {
    if (!this._httpConnection) {
      const httpRpcUrl = process.env.SOLANA_HTTP_RPC_URL?.startsWith('http')
        ? process.env.SOLANA_HTTP_RPC_URL
        : clusterApiUrl('mainnet-beta');
      
      this._httpConnection = new Connection(httpRpcUrl, 'confirmed');
      console.log(`[CONNECTION_MANAGER] Created shared HTTP connection to: ${httpRpcUrl}`);
      
      // Start the global RPC queue processor
      this._startQueueProcessor();
    }
    return this._httpConnection;
  }

  public static getWsConnection(): Connection {
    if (!this._wsConnection) {
      const httpRpcUrl = process.env.SOLANA_HTTP_RPC_URL?.startsWith('http')
        ? process.env.SOLANA_HTTP_RPC_URL
        : clusterApiUrl('mainnet-beta');
      
      const wssRpcUrl = process.env.SOLANA_WSS_RPC_URL?.startsWith('ws')
        ? process.env.SOLANA_WSS_RPC_URL
        : undefined;

      if (!wssRpcUrl) {
        throw new Error('SOLANA_WSS_RPC_URL must be set in .env for WebSocket connection.');
      }

      this._wsConnection = new Connection(httpRpcUrl, {
        commitment: 'confirmed',
        wsEndpoint: wssRpcUrl,
      } as any);
      
      console.log(`[CONNECTION_MANAGER] Created shared WebSocket connection to: ${wssRpcUrl}`);
    }
    return this._wsConnection;
  }

  /**
   * Start the global RPC queue processor
   */
  private static _startQueueProcessor(): void {
    if (this._queueProcessor) return;
    
    const rpcDelayMs = parseInt(process.env.RPC_DELAY_MS || '100', 10);
    console.log(`[CONNECTION_MANAGER] Starting global RPC queue processor with ${rpcDelayMs}ms delay`);
    
    this._queueProcessor = setInterval(() => {
      this._processRpcQueue();
    }, rpcDelayMs);
  }

  /**
   * Process the global RPC queue - only one request at a time
   */
  private static async _processRpcQueue(): Promise<void> {
    if (this._rpcQueue.length === 0 || this._isProcessingQueue) {
      return;
    }

    this._isProcessingQueue = true;
    const request = this._rpcQueue.shift()!;

    try {
      this.trackRequest();
      const connection = this.getHttpConnection();
      let result: any;

      switch (request.type) {
        case 'getParsedTransactions':
          result = await connection.getParsedTransactions(request.params[0], request.params[1]);
          break;
        case 'getSlot':
          result = await connection.getSlot();
          break;
        case 'getMultipleAccountsInfo':
          result = await connection.getMultipleAccountsInfo(request.params[0]);
          break;
        case 'getAccountInfo':
          result = await connection.getAccountInfo(request.params[0]);
          break;
        case 'getLatestBlockhash':
          result = await connection.getLatestBlockhash(request.params[0]);
          break;
        case 'confirmTransaction':
          result = await connection.confirmTransaction(request.params[0], request.params[1]);
          break;
        default:
          throw new Error(`Unknown RPC request type: ${request.type}`);
      }

      request.resolve(result);
    } catch (error) {
      console.error(`[RPC_QUEUE] Error processing ${request.type} from ${request.source}:`, error);
      request.reject(error);
    } finally {
      this._isProcessingQueue = false;
    }
  }

  /**
   * Queue an RPC request instead of executing it immediately
   */
  public static queueRpcRequest<T>(
    type: RpcRequest['type'],
    params: any[],
    source: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: RpcRequest = {
        id: `${Date.now()}-${Math.random()}`,
        type,
        params,
        resolve,
        reject,
        source
      };
      
      this._rpcQueue.push(request);
    });
  }

  /**
   * Convenience methods for common RPC calls
   */
  public static async getParsedTransactions(
    signatures: string[],
    options: any,
    source: string
  ): Promise<(ParsedTransactionWithMeta | null)[]> {
    return this.queueRpcRequest('getParsedTransactions', [signatures, options], source);
  }

  public static async getSlot(source: string): Promise<number> {
    return this.queueRpcRequest('getSlot', [], source);
  }

  public static async getMultipleAccountsInfo(
    publicKeys: any[],
    source: string
  ): Promise<any[]> {
    return this.queueRpcRequest('getMultipleAccountsInfo', [publicKeys], source);
  }

  public static async getAccountInfo(
    publicKey: any,
    source: string
  ): Promise<any> {
    return this.queueRpcRequest('getAccountInfo', [publicKey], source);
  }

  public static async getLatestBlockhash(
    commitment: any,
    source: string
  ): Promise<any> {
    return this.queueRpcRequest('getLatestBlockhash', [commitment], source);
  }

  public static async confirmTransaction(
    strategy: any,
    commitment: any,
    source: string
  ): Promise<any> {
    return this.queueRpcRequest('confirmTransaction', [strategy, commitment], source);
  }

  /**
   * Track RPC request for performance monitoring
   */
  public static trackRequest(): void {
    this._requestCount++;
    const now = Date.now();
    this._requestTimes.push(now);
    
    // Keep only requests from the last 10 seconds for accurate RPS calculation
    this._requestTimes = this._requestTimes.filter(time => now - time <= 10000);
    
    // Report RPS every 5 seconds to monitor activity
    if (now - this._lastRpsReport >= 5000) {
      const stats = this.getRpsStats();
      console.log(`[RPC_STATS] Current RPS: ${stats.currentRps.toFixed(1)}, Total: ${stats.totalRequests}, Queue: ${stats.queueLength}`);
      this._lastRpsReport = now;
    }
  }

  /**
   * Get current RPS statistics
   */
  public static getRpsStats(): { currentRps: number; totalRequests: number; queueLength: number } {
    const now = Date.now();
    const recentRequests = this._requestTimes.filter(time => now - time <= 10000);
    return {
      currentRps: recentRequests.length / 10, // requests in last 10 seconds divided by 10 = RPS
      totalRequests: this._requestCount,
      queueLength: this._rpcQueue.length
    };
  }
}

export { ConnectionManager };

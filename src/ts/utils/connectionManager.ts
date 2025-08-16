import { Connection, clusterApiUrl, ParsedTransactionWithMeta } from '@solana/web3.js';
import * as https from 'https';

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
  
  // Adaptive rate limiting
  private static _currentDelayMs: number = 100;
  private static _rateLimitErrors: number = 0;
  private static _lastRateLimitTime: number = 0;
  
  // Global RPC tracking - intercept ALL RPC calls system-wide
  private static _allRpcCalls: number[] = [];
  private static _originalFetch: typeof fetch | null = null;
  
  // Persistent HTTP connection pool
  private static _httpsAgent: https.Agent | null = null;

  public static getHttpConnection(): Connection {
    if (!this._httpConnection) {
      const httpRpcUrl = process.env.SOLANA_HTTP_RPC_URL?.startsWith('http')
        ? process.env.SOLANA_HTTP_RPC_URL
        : clusterApiUrl('mainnet-beta');
      
      // Create persistent HTTPS agent for connection pooling
      this._createHttpsAgent();
      
      // Configure Connection with persistent agent
      this._httpConnection = new Connection(httpRpcUrl, {
        commitment: 'confirmed',
        httpAgent: this._httpsAgent,
        fetch: this._createOptimizedFetch()
      } as any);
      
      console.log(`[CONNECTION_MANAGER] Created shared HTTP connection with persistent agent to: ${httpRpcUrl}`);
      
      // Start the global RPC queue processor
      this._startQueueProcessor();
      
      // Initialize global RPC tracking
      this._initializeGlobalRpcTracking();
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

      // Create WebSocket connection with proper configuration
      // Use HTTP endpoint for RPC calls and WSS endpoint for subscriptions
      this._wsConnection = new Connection(httpRpcUrl, {
        commitment: 'confirmed',
        wsEndpoint: wssRpcUrl,
      });
      
      console.log(`[CONNECTION_MANAGER] Created shared WebSocket connection - HTTP: ${httpRpcUrl}, WSS: ${wssRpcUrl}`);
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
    
    // Report TOTAL RPS every 5 seconds to monitor all system activity
    if (now - this._lastRpsReport >= 5000) {
      const stats = this.getRpsStats();
      const totalSystemRps = this.getTotalSystemRps();
      const queueBreakdownStr = Object.entries(stats.queueBreakdown)
        .map(([source, count]) => `${source}:${count}`)
        .join(', ');
      
      // Calculate capacity utilization (assuming 250 RPS limit from Chainstack)
      const rpsLimit = 250;
      const queueUtilization = (stats.currentRps / rpsLimit * 100).toFixed(1);
      const totalUtilization = (totalSystemRps / rpsLimit * 100).toFixed(1);
      const headroom = rpsLimit - totalSystemRps;
      
      // console.log(`[SYSTEM_RPS] Queue: ${stats.currentRps.toFixed(1)} RPS | TOTAL SYSTEM: ${totalSystemRps.toFixed(1)}/${rpsLimit} RPS (${totalUtilization}% capacity) | Headroom: ${headroom.toFixed(1)} RPS | Queue: ${stats.queueLength} [${queueBreakdownStr}]`);
      this._lastRpsReport = now;
    }
  }

  /**
   * Initialize global RPC tracking by intercepting all HTTP calls to Chainstack
   */
  private static _initializeGlobalRpcTracking(): void {
    if (this._originalFetch) return; // Already initialized
    
    const chainstackUrl = process.env.SOLANA_HTTP_RPC_URL || '';
    if (!chainstackUrl.includes('chainstack.com')) {
      console.log('[GLOBAL_RPC_TRACKING] Not a Chainstack URL, skipping global tracking');
      return;
    }
    
    // Store original fetch
    this._originalFetch = global.fetch;
    
    // Override global fetch to track all HTTP requests to Chainstack
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      
      // Track all requests to our Chainstack endpoint (silent tracking)
      if (url.includes('chainstack.com')) {
        const now = Date.now();
        this._allRpcCalls.push(now);
        
        // Keep only calls from last 10 seconds
        this._allRpcCalls = this._allRpcCalls.filter(time => now - time <= 10000);
      }
      
      // Call original fetch
      return this._originalFetch!(input, init);
    };
    
    // Intercept Node.js HTTP/HTTPS modules which Solana Web3.js likely uses
    try {
      const https = require('https');
      const originalHttpsRequest = https.request;
      
      https.request = function(options: any, callback?: any) {
        const url = typeof options === 'string' ? options : 
                   (options.hostname || options.host) + (options.path || '');
        
        if (url.includes('chainstack.com')) {
          const now = Date.now();
          ConnectionManager._allRpcCalls.push(now);
          // console.log(`[GLOBAL_RPC_TRACKING] HTTPS request to Chainstack detected: ${url.substring(0, 100)}...`);
          
          // Keep only calls from last 10 seconds
          ConnectionManager._allRpcCalls = ConnectionManager._allRpcCalls.filter(time => now - time <= 10000);
        }
        
        return originalHttpsRequest.call(this, options, callback);
      };
      
      console.log('[GLOBAL_RPC_TRACKING] Initialized global HTTP interception (fetch + Node.js HTTPS) for Chainstack RPC tracking');
    } catch (error) {
      console.log('[GLOBAL_RPC_TRACKING] Could not intercept Node.js HTTPS module:', error);
    }
  }

  /**
   * Get current RPS statistics with queue breakdown by source
   */
  public static getRpsStats(): { currentRps: number; totalRequests: number; queueLength: number; queueBreakdown: Record<string, number> } {
    const now = Date.now();
    const recentRequests = this._requestTimes.filter(time => now - time <= 10000);
    
    // Count queue items by source
    const queueBreakdown: Record<string, number> = {};
    this._rpcQueue.forEach(request => {
      queueBreakdown[request.source] = (queueBreakdown[request.source] || 0) + 1;
    });
    
    return {
      currentRps: recentRequests.length / 10, // requests in last 10 seconds divided by 10 = RPS
      totalRequests: this._requestCount,
      queueLength: this._rpcQueue.length,
      queueBreakdown
    };
  }

  /**
   * Get TOTAL system RPS including all HTTP calls to Chainstack
   */
  public static getTotalSystemRps(): number {
    const now = Date.now();
    const recentCalls = this._allRpcCalls.filter(time => now - time <= 10000);
    return recentCalls.length / 10; // RPS over last 10 seconds
  }

  /**
   * Create persistent HTTPS agent for connection pooling
   */
  private static _createHttpsAgent(): void {
    if (this._httpsAgent) return;
    
    this._httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000, // Keep connections alive for 30 seconds
      maxSockets: 5, // Limit concurrent connections
      maxFreeSockets: 2, // Keep some connections in pool
      timeout: 10000, // 10 second timeout
    });
    
    console.log('[CONNECTION_MANAGER] Created persistent HTTPS agent with connection pooling');
  }

  /**
   * Create optimized fetch function that uses our persistent agent
   */
  private static _createOptimizedFetch(): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // Use our global fetch which has tracking
      return global.fetch(input, {
        ...init,
        // Add agent for Node.js environments
        agent: this._httpsAgent,
      } as any);
    };
  }
}

export { ConnectionManager };

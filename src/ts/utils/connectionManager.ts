import { Connection, clusterApiUrl } from '@solana/web3.js';

/**
 * Shared connection manager to avoid multiple connections to the same RPC endpoint
 * This helps prevent rate limiting issues by reusing the same connection pool
 */
class ConnectionManager {
  private static _httpConnection: Connection | null = null;
  private static _wsConnection: Connection | null = null;

  public static getHttpConnection(): Connection {
    if (!this._httpConnection) {
      const httpRpcUrl = process.env.SOLANA_HTTP_RPC_URL?.startsWith('http')
        ? process.env.SOLANA_HTTP_RPC_URL
        : clusterApiUrl('mainnet-beta');
      
      this._httpConnection = new Connection(httpRpcUrl, 'confirmed');
      console.log(`[CONNECTION_MANAGER] Created shared HTTP connection to: ${httpRpcUrl}`);
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
}

export { ConnectionManager };

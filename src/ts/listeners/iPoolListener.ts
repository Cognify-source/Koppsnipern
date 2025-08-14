import { PoolData } from '../services/safetyService';

// Defines the callback function that will be triggered when a new pool is found.
export type NewPoolCallback = (poolData: PoolData) => void;

/**
 * Defines the standard interface for all DEX listeners.
 * This ensures that each listener can be started and managed in a consistent way.
 */
export interface IPoolListener {
  /**
   * Starts the listener.
   */
  start(): void;
}

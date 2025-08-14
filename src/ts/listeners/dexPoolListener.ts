import { PoolData } from '../services/safetyService';
import { IPoolListener, NewPoolCallback } from './iPoolListener';
import { PumpV1Listener } from './sources/pumpV1Listener';
// Future listeners for other DEXes like Meteora can be imported here.
// import { MeteoraListener } from './sources/meteoraListener';

/**
 * Manages all individual DEX pool listeners.
 * This class initializes and starts listeners for various DEX platforms.
 */
export class DexPoolListener {
  private listeners: IPoolListener[] = [];

  constructor(newPoolCallback: NewPoolCallback) {
    // Instantiate all the different DEX listeners and add them to the array.
    // This makes it easy to add or remove sources in the future.
    this.listeners.push(new PumpV1Listener(newPoolCallback));
    // Example for the future:
    // this.listeners.push(new MeteoraListener(newPoolCallback));
  }

  /**
   * Starts all registered DEX listeners.
   */
  public async start() {
    console.log(`[DEX_MANAGER] Initializing ${this.listeners.length} pool listener(s)...`);
    for (const listener of this.listeners) {
      try {
        // No await here, so listeners can run in parallel
        listener.start();
      } catch (error) {
        console.error(`[DEX_MANAGER] Error starting listener ${listener.constructor.name}:`, error);
      }
    }
    console.log(`[DEX_MANAGER] All listeners have been started.`);
  }
}

// Re-exporting these types for convenience in other parts of the application
export { NewPoolCallback, PoolData };

import { PoolData } from '../services/safetyService';
import { IPoolListener, NewPoolCallback } from './iPoolListener';
import { PumpV1Listener } from './sources/pumpV1Listener';
import { PumpAmmListener } from './sources/pumpAmmListener';
import { LaunchLabListener } from './sources/launchLabListener';
import { MeteoraDbcListener } from './sources/meteoraDbcListener';
// Future listeners for other DEXes like Meteora can be imported here.
// import { MeteoraListener } from './sources/meteoraListener';

/**
 * Manages all individual DEX pool listeners.
 * This class initializes and starts listeners for various DEX platforms.
 */
export class DexPoolListener {
  private listeners: IPoolListener[] = [];

  constructor(newPoolCallback: NewPoolCallback) {
    // TESTING: Only PumpV1Listener for debugging RPC rate limiting issues
    // Other listeners disabled until we solve the fundamental problems
    this.listeners.push(new PumpV1Listener(newPoolCallback));
    
    // Disabled for testing:
    // this.listeners.push(new PumpAmmListener(newPoolCallback));
    // this.listeners.push(new LaunchLabListener(newPoolCallback));
    // this.listeners.push(new MeteoraDbcListener(newPoolCallback));
  }

  /**
   * Starts all registered DEX listeners.
   */
  public async start() {
    console.log(`[DEX_MANAGER] Initializing ${this.listeners.length} pool listener(s)...`);
    for (const listener of this.listeners) {
      try {
        // We now await start() because some listeners might have async initialization.
        await listener.start();
      } catch (error) {
        console.error(`[DEX_MANAGER] Error starting listener ${listener.constructor.name}:`, error);
      }
    }
    console.log(`[DEX_MANAGER] All listeners have been started.`);
  }
}

// Re-exporting these types for convenience in other parts of the application
export { NewPoolCallback, PoolData };

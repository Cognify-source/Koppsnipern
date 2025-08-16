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
    // All listeners optimized with 50ms intervals and global RPC queue
    this.listeners.push(new PumpV1Listener(newPoolCallback));
    this.listeners.push(new PumpAmmListener(newPoolCallback));
    this.listeners.push(new LaunchLabListener(newPoolCallback));
    this.listeners.push(new MeteoraDbcListener(newPoolCallback));
  }

  /**
   * Starts all registered DEX listeners.
   */
  public async start() {
    for (const listener of this.listeners) {
      try {
        await listener.start();
      } catch (error) {
        // Silent error handling - only global RPS logging allowed
      }
    }
  }
}

// Re-exporting these types for convenience in other parts of the application
export { NewPoolCallback, PoolData };

import { delayedLpChecker } from './delayedLpChecker';

/**
 * Simple status monitor for delayed LP checker
 */
export class StatusMonitor {
  private static instance: StatusMonitor;
  private intervalId: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): StatusMonitor {
    if (!StatusMonitor.instance) {
      StatusMonitor.instance = new StatusMonitor();
    }
    return StatusMonitor.instance;
  }

  /**
   * Start monitoring and logging status every 30 seconds
   */
  public start(): void {
    if (this.intervalId) {
      return; // Already started
    }

    this.intervalId = setInterval(() => {
      const status = delayedLpChecker.getStatus();
      const stats = delayedLpChecker.getTimingStats();
      
      if (status.pendingChecks > 0) {
        const oldestCheckAge = status.oldestCheck ? Math.round(status.oldestCheck / 1000) : 0;
        console.log(`[STATUS] Delayed LP Checker: ${status.pendingChecks} pending checks, oldest: ${oldestCheckAge}s`);
      }
      
      // Show timing statistics if we have data
      if (stats.totalScheduled > 0) {
        console.log(`[LP_STATS] 📊 Scheduled: ${stats.totalScheduled}, Found: ${stats.totalFound}, Timed out: ${stats.totalTimedOut}, Success rate: ${stats.successRate}%`);
        
        if (stats.totalFound > 0) {
          console.log(`[LP_TIMING] ⏱️  Avg: ${stats.avgTimeToLp}ms, Median: ${stats.medianTimeToLp}ms, Range: ${stats.minTimeToLp}-${stats.maxTimeToLp}ms`);
        }
      }
    }, 30000); // Every 30 seconds

    console.log('[STATUS] Status monitor started');
  }

  /**
   * Stop monitoring
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[STATUS] Status monitor stopped');
    }
  }
}

// Auto-start the status monitor
StatusMonitor.getInstance().start();

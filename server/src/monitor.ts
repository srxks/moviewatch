import { store } from './store.js';
import { checkDistrict } from './providers/district.js';
import { checkBookMyShow } from './providers/bookmyshow.js';
import { telegram } from './telegram.js';
import { WatchTarget, CheckResult, NormalizedSession } from './types.js';

export class MonitoringEngine {
  private isRunning = false;
  private lastCheckedTimestamps = new Map<string, number>();

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[Monitor] Ultra-fast monitoring engine initialized.');

    // Start Telegram interactive bot commands listener
    telegram.startCommandListener(() => this.pollAll());

    // Main 24/7 asynchronous loop
    this.loop();
  }

  stop() {
    this.isRunning = false;
    telegram.stopCommandListener();
    console.log('[Monitor] Engine stopped.');
  }

  private async loop() {
    while (this.isRunning) {
      try {
        await this.pollDueWatches();
      } catch (err: any) {
        console.error('[Monitor] Loop error:', err.message);
      }
      // Check every 2 seconds for any watch due for its next poll
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  async pollAll() {
    const watches = store.getWatches().filter(w => w.enabled);
    console.log(`[Monitor] Scanning all ${watches.length} active watches...`);
    await Promise.allSettled(watches.map(w => this.pollWatch(w)));
  }

  private async pollDueWatches() {
    const now = Date.now();
    const watches = store.getWatches().filter(w => w.enabled);

    for (const w of watches) {
      const lastCheck = this.lastCheckedTimestamps.get(w.id) || 0;
      const intervalMs = (w.pollIntervalSec || 60) * 1000;

      if (now - lastCheck >= intervalMs) {
        this.lastCheckedTimestamps.set(w.id, now);
        // Fire asynchronously so one slow provider/target never blocks another
        this.pollWatch(w).catch(err => {
          console.error(`[Monitor] Error polling watch ${w.id}:`, err.message);
        });
      }
    }
  }

  async pollWatch(target: WatchTarget): Promise<void> {
    const dates = target.targetDates && target.targetDates.length > 0
      ? target.targetDates
      : [new Date().toISOString().split('T')[0]];

    for (const date of dates) {
      let result: CheckResult;

      if (target.provider === 'district') {
        result = await checkDistrict(target, date);
      } else {
        result = await checkBookMyShow(target, date, process.env.PROXY_URL);
      }

      // Update provider health
      if (result.kind === 'error') {
        store.updateProviderHealth(target.provider, 'degraded', result.error || 'Check failed', result.latencyMs);
        store.updateWatchStatus(target.id, 'error', result.latencyMs, result.error);

        const health = store.getProvidersHealth()[target.provider];
        if (health && health.consecutiveErrors === 3) {
          await telegram.sendWarning(target.provider, `Target '${target.name}' failed 3 times: ${result.error}`);
        }
      } else {
        store.updateProviderHealth(target.provider, 'operational', 'Responsive', result.latencyMs);
        store.updateWatchStatus(target.id, result.kind, result.latencyMs);
      }

      // If open with matching sessions: detect newly opened showtimes!
      if (result.kind === 'open' && result.matchedSessions) {
        const currentSids = new Set<string>();

        for (const session of result.matchedSessions) {
          currentSids.add(session.sid);

          // Check deduplication
          const alreadyAlerted = store.isSessionAlerted(target.id, session.sid);
          if (!alreadyAlerted) {
            console.log(`[Monitor] 🔥 NEW SHOW DETECTED: ${target.name} at ${session.cinema} (${date} ${session.time})`);

            // Immediate Telegram push notification
            await telegram.sendShowAlert(target, session, date);

            // Record as alerted
            store.markSessionAlerted(target.id, session.sid, session);
          }
        }

        // Re-arm sessions that disappeared and reappeared
        store.recordSessionSeen(target.id, currentSids);
      }
    }
  }
}

export const monitor = new MonitoringEngine();

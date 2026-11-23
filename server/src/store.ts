import fs from 'fs';
import path from 'path';
import { WatchTarget, ProviderHealth, EventLog, NormalizedSession } from './types.js';

interface StorageSchema {
  watches: WatchTarget[];
  alertedSessions: Record<string, { alertedAt: string; session: NormalizedSession }>; // key: `${watchId}:${sid}`
  sessionMissCount: Record<string, number>; // key: `${watchId}:${sid}`
  eventLogs: EventLog[];
  providerHealth: Record<string, ProviderHealth>;
}

const DATA_FILE = path.resolve(process.cwd(), 'data', 'monitor_state.json');

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const initialWatches: WatchTarget[] = [
  {
    id: 'dune-palazzo-imax',
    name: 'Dune: Part Three — PVR Palazzo IMAX, Chennai',
    provider: 'bookmyshow',
    movieCode: 'ET00526290', // Dune: Part Three IMAX 2D
    refEventCode: 'ET00526290',
    city: 'chennai',
    regionCode: 'CHEN',
    regionSlug: 'chennai',
    lat: '13.0827',
    lng: '80.2707',
    targetDates: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'],
    cinemaFilter: 'Palazzo',
    formatFilter: 'IMAX',
    enabled: true,
    pollIntervalSec: 60,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'avengers-doomsday-imax',
    name: 'Avengers: Doomsday — Chennai IMAX',
    provider: 'district',
    movieCode: '176735', // District content_id for Avengers Doomsday in Chennai
    contentId: '176735',
    city: 'chennai',
    lat: '13.0827',
    lng: '80.2707',
    targetDates: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'],
    formatFilter: 'IMAX',
    enabled: true,
    pollIntervalSec: 60,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'om-operation-mole-sangam',
    name: 'O.M: Operation Mole — Sangam Cinemas, Chennai',
    provider: 'district',
    movieCode: '225928',
    contentId: '225928',
    city: 'chennai',
    lat: '13.0827',
    lng: '80.2707',
    targetDates: ['2026-11-23', '2026-11-24'],
    cinemaFilter: 'Sangam',
    enabled: true,
    pollIntervalSec: 60,
    createdAt: new Date().toISOString(),
  }
];

class Store {
  private data: StorageSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): StorageSchema {
    try {
      ensureDir(DATA_FILE);
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('[Store] Failed to read storage file, initializing fresh:', e);
    }

    const initial: StorageSchema = {
      watches: initialWatches,
      alertedSessions: {},
      sessionMissCount: {},
      eventLogs: [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          watchId: 'system',
          watchName: 'System',
          provider: 'district',
          type: 'PROVIDER_RECOVERED',
          message: 'Monitoring worker initialized with persistent storage'
        }
      ],
      providerHealth: {
        district: {
          key: 'district',
          label: 'District',
          status: 'operational',
          message: 'Direct API active',
          lastCheckedAt: new Date().toISOString(),
          latencyMs: 0,
          consecutiveErrors: 0,
        },
        bookmyshow: {
          key: 'bookmyshow',
          label: 'BookMyShow',
          status: 'operational',
          message: 'Direct API with Chrome TLS fingerprint active',
          lastCheckedAt: new Date().toISOString(),
          latencyMs: 0,
          consecutiveErrors: 0,
        }
      }
    };
    this.save(initial);
    return initial;
  }

  private save(data = this.data) {
    try {
      ensureDir(DATA_FILE);
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Store] Save failed:', e);
    }
  }

  getWatches(): WatchTarget[] {
    return this.data.watches;
  }

  getWatchById(id: string): WatchTarget | undefined {
    return this.data.watches.find(w => w.id === id);
  }

  saveWatch(target: WatchTarget) {
    const idx = this.data.watches.findIndex(w => w.id === target.id);
    if (idx >= 0) {
      this.data.watches[idx] = target;
    } else {
      this.data.watches.push(target);
    }
    this.save();
  }

  deleteWatch(id: string): boolean {
    const before = this.data.watches.length;
    this.data.watches = this.data.watches.filter(w => w.id !== id);
    const changed = this.data.watches.length !== before;
    if (changed) this.save();
    return changed;
  }

  updateWatchStatus(id: string, status: 'open' | 'closed' | 'error', latencyMs: number, error?: string) {
    const w = this.getWatchById(id);
    if (w) {
      w.lastCheckedAt = new Date().toISOString();
      w.lastStatus = status;
      w.lastLatencyMs = latencyMs;
      w.lastError = error;
      this.save();
    }
  }

  isSessionAlerted(watchId: string, sid: string): boolean {
    const key = `${watchId}:${sid}`;
    return Boolean(this.data.alertedSessions[key]);
  }

  markSessionAlerted(watchId: string, sid: string, session: NormalizedSession) {
    const key = `${watchId}:${sid}`;
    this.data.alertedSessions[key] = {
      alertedAt: new Date().toISOString(),
      session
    };
    delete this.data.sessionMissCount[key];
    this.save();
  }

  recordSessionSeen(watchId: string, currentSids: Set<string>) {
    // If an alerted session disappeared from the listing for 3 checks, forget it so it re-arms
    for (const key of Object.keys(this.data.alertedSessions)) {
      if (!key.startsWith(`${watchId}:`)) continue;
      const sid = key.slice(watchId.length + 1);
      if (!currentSids.has(sid)) {
        this.data.sessionMissCount[key] = (this.data.sessionMissCount[key] || 0) + 1;
        if (this.data.sessionMissCount[key] >= 3) {
          delete this.data.alertedSessions[key];
          delete this.data.sessionMissCount[key];
        }
      } else {
        this.data.sessionMissCount[key] = 0;
      }
    }
    this.save();
  }

  addEventLog(log: Omit<EventLog, 'id' | 'timestamp'>) {
    const fullLog: EventLog = {
      ...log,
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString()
    };
    this.data.eventLogs.unshift(fullLog);
    if (this.data.eventLogs.length > 200) {
      this.data.eventLogs = this.data.eventLogs.slice(0, 200);
    }
    this.save();
  }

  getEventLogs(limit = 50): EventLog[] {
    return this.data.eventLogs.slice(0, limit);
  }

  updateProviderHealth(key: 'district' | 'bookmyshow', status: ProviderHealth['status'], message: string, latencyMs: number) {
    const current = this.data.providerHealth[key] || {
      key,
      label: key === 'district' ? 'District' : 'BookMyShow',
      status: 'operational',
      message: '',
      lastCheckedAt: new Date().toISOString(),
      latencyMs: 0,
      consecutiveErrors: 0,
    };

    if (status === 'error' || status === 'blocked') {
      current.consecutiveErrors = (current.consecutiveErrors || 0) + 1;
    } else {
      current.consecutiveErrors = 0;
    }

    current.status = status;
    current.message = message;
    current.latencyMs = latencyMs;
    current.lastCheckedAt = new Date().toISOString();
    this.data.providerHealth[key] = current;
    this.save();
  }

  getProvidersHealth(): Record<string, ProviderHealth> {
    return this.data.providerHealth;
  }
}

export const store = new Store();

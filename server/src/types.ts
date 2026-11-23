export type ProviderKey = 'district' | 'bookmyshow';

export interface WatchTarget {
  id: string;
  name: string; // e.g. "Dune: Part Three — PVR Palazzo IMAX"
  provider: ProviderKey;
  movieCode: string; // District movieCode/contentId or BMS etCodes
  contentId?: string;
  refEventCode?: string;
  city: string; // e.g. "chennai"
  regionCode?: string; // BMS region code (CHEN)
  regionSlug?: string; // BMS region slug (chennai)
  lat: string;
  lng: string;
  targetDates: string[]; // YYYY-MM-DD
  cinemaFilter?: string; // e.g. "PVR Palazzo", "Palazzo"
  formatFilter?: string; // e.g. "IMAX", "4DX", "3D"
  language?: string;
  venueId?: string;
  bookingUrl?: string;
  enabled: boolean;
  pollIntervalSec: number; // default: 60
  createdAt: string;
  lastCheckedAt?: string;
  lastLatencyMs?: number;
  lastStatus?: 'open' | 'closed' | 'error';
  lastError?: string;
}

export interface NormalizedSession {
  sid: string;
  cinema: string;
  time: string; // e.g. "14:35" or "02:35 PM"
  audi?: string;
  format?: string;
  avail: number | null;
  total: number | null;
  tiers?: string;
  bookingUrl?: string;
}

export interface CheckResult {
  kind: 'open' | 'closed' | 'error';
  sessions?: NormalizedSession[];
  matchedSessions?: NormalizedSession[];
  latencyMs: number;
  note?: string;
  error?: string;
  rawData?: any;
}

export interface ProviderHealth {
  key: ProviderKey;
  label: string;
  status: 'operational' | 'degraded' | 'blocked' | 'error';
  message: string;
  lastCheckedAt: string;
  latencyMs: number;
  consecutiveErrors: number;
}

export interface EventLog {
  id: string;
  timestamp: string;
  watchId: string;
  watchName: string;
  provider: ProviderKey;
  type: 'NEW_SHOW' | 'DATE_OPEN' | 'PROVIDER_ERROR' | 'PROVIDER_RECOVERED' | 'WARNING';
  message: string;
  details?: any;
}

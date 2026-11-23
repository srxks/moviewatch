import { Impit } from 'impit';
import { WatchTarget, CheckResult, NormalizedSession } from '../types.js';

let client: Impit | null = null;

function getClient(proxyUrl?: string): Impit {
  if (client) return client;
  const normalizedProxy = proxyUrl ? proxyUrl.replace(/^socks5:\/\//i, 'socks5h://') : '';
  client = new Impit({
    browser: 'chrome',
    ...(normalizedProxy ? { proxyUrl: normalizedProxy } : {}),
  });
  return client;
}

export const toDateCode = (isoDate: string) => isoDate.replaceAll('-', '');

function buildApiUrl(target: WatchTarget, date: string): string {
  const eventCode = target.movieCode;
  const q = new URLSearchParams({
    etCodes: eventCode,
    dateCode: toDateCode(date),
    isDesktop: 'true',
    regionCode: target.regionCode || 'CHEN',
    xLocationShared: 'false',
    memberId: '',
    lsId: '',
    subCode: '',
    appCode: 'WEB',
    refEventCode: target.refEventCode || eventCode,
    ...(target.language ? { language: target.language } : {}),
  });
  return `https://in.bookmyshow.com/api/movies-data/v5/showtimes-by-event/primary-dynamic?${q}`;
}

const bmsId = () => `1.${Math.floor(Math.random() * 9e8 + 1e8)}.${Date.now()}`;

function collectVenueCards(node: any, out: any[] = []): any[] {
  if (Array.isArray(node)) {
    for (const n of node) collectVenueCards(n, out);
  } else if (node && typeof node === 'object') {
    if (node.type === 'venue-card') out.push(node);
    for (const v of Object.values(node)) collectVenueCards(v, out);
  }
  return out;
}

function extractTiers(showtime: any): string {
  const widgets = showtime?.customGestureCTA?.additionalData?.bottomSheetData?.widgets ?? [];
  return widgets
    .filter((w: any) => w?.variableData?.seatType)
    .map((w: any) => {
      const v = w.variableData;
      const cost = String(v.seatCost || '').replace(/[^\d.]/g, '');
      const price = cost ? `₹${Math.round(Number(cost))}` : '';
      return `${v.seatType} ${price} (${v.seatAvalibility || ''})`.replace(/\s+/g, ' ').trim();
    })
    .join(' · ');
}

export async function checkBookMyShow(target: WatchTarget, date: string, proxyUrl?: string): Promise<CheckResult> {
  const start = Date.now();
  const impit = getClient(proxyUrl);
  const url = buildApiUrl(target, date);

  try {
    const res = await impit.fetch(url, {
      headers: {
        accept: 'application/json, text/plain, */*',
        'x-region-code': target.regionCode || 'CHEN',
        'x-region-slug': target.regionSlug || 'chennai',
        'x-latitude': target.lat || '13.0827',
        'x-longitude': target.lng || '80.2707',
        'x-bms-id': bmsId(),
        'x-app-code': 'WEB',
        'x-platform-code': 'WEB',
        'x-platform': 'WEB',
      },
    });

    const latencyMs = Date.now() - start;

    if (res.status === 403) {
      return {
        kind: 'error',
        latencyMs,
        error: 'BookMyShow Cloudflare Challenge (HTTP 403). Configure residential proxy or rotate headers.',
      };
    }

    if (res.status !== 200) {
      return { kind: 'error', latencyMs, error: `BookMyShow HTTP ${res.status}` };
    }

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch (e: any) {
      return { kind: 'error', latencyMs, error: `Unparseable BMS response: ${e.message}` };
    }

    // Closed date has no showtimeWidgets key
    if (!data?.data?.showtimeWidgets) {
      return { kind: 'closed', latencyMs, note: 'Date not on sale yet' };
    }

    const venueCards = collectVenueCards(data.data.showtimeWidgets);
    const allSessions: NormalizedSession[] = [];
    const matchedSessions: NormalizedSession[] = [];

    const dateCode = toDateCode(date);
    const fallbackBookingUrl = `https://in.bookmyshow.com/buytickets/chennai/movie-chen-${target.movieCode}-MT/${dateCode}`;

    for (const card of venueCards) {
      const info = card.additionalData ?? {};
      const venueName = info.venueName || info.venueCode || 'Unknown Cinema';

      for (const section of card.showtimesSections ?? []) {
        for (const st of section.showtimes ?? []) {
          const ad = st.additionalData ?? {};
          const sid = String(ad.sessionId || `${info.venueCode}-${ad.showTimeCode || st.title}`);
          const format = String(st.screenAttr || ad.attributes || '2D');
          const time = String(ad.showTime || st.title || '');
          const tiers = extractTiers(st);

          const session: NormalizedSession = {
            sid,
            cinema: venueName,
            time,
            audi: '',
            format,
            avail: null,
            total: null,
            tiers,
            bookingUrl: target.bookingUrl || fallbackBookingUrl,
          };

          allSessions.push(session);

          // Filtering
          let matchesCinema = true;
          if (target.cinemaFilter) {
            matchesCinema = venueName.toLowerCase().includes(target.cinemaFilter.toLowerCase());
          }

          let matchesFormat = true;
          if (target.formatFilter) {
            matchesFormat = format.toUpperCase().includes(target.formatFilter.toUpperCase());
          }

          if (matchesCinema && matchesFormat) {
            matchedSessions.push(session);
          }
        }
      }
    }

    return {
      kind: 'open',
      latencyMs,
      sessions: allSessions,
      matchedSessions,
      rawData: data,
    };
  } catch (err: any) {
    return {
      kind: 'error',
      latencyMs: Date.now() - start,
      error: `BMS Fetch Error: ${err.message}`,
    };
  }
}

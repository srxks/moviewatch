import { WatchTarget, CheckResult, NormalizedSession } from '../types.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function generateGuestToken(): string {
  let digits = '';
  for (let i = 0; i < 18; i++) digits += Math.floor(Math.random() * 10);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 11; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${Date.now()}_${digits}_${suffix}`;
}

function buildApiUrl(target: WatchTarget, date: string): string {
  const contentId = target.contentId || target.movieCode;
  const q = new URLSearchParams({
    version: '3',
    site_id: '1',
    channel: 'mweb',
    child_site_id: '1',
    platform: 'district',
    movieCode: target.movieCode,
    city_key: target.city.toLowerCase(),
    content_id: contentId,
    date,
    latitude: target.lat || '13.0827',
    longitude: target.lng || '80.2707',
    cinemaOrderLogic: '3',
  });
  return `https://www.district.in/gw/consumer/movies/v5/movie?${q}`;
}

function toLocalTime(utcDateStr: string): string {
  try {
    const d = new Date(utcDateStr.endsWith('Z') ? utcDateStr : `${utcDateStr}Z`);
    return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return utcDateStr;
  }
}

export async function checkDistrict(target: WatchTarget, date: string): Promise<CheckResult> {
  const start = Date.now();
  const url = buildApiUrl(target, date);

  try {
    const res = await fetch(url, {
      headers: {
        accept: '*/*',
        api_source: 'district',
        'x-app-type': 'ed_mweb',
        'x-guest-token': generateGuestToken(),
        'x-request-id': crypto.randomUUID(),
        'user-agent': UA,
        ...(target.bookingUrl ? { referer: target.bookingUrl } : {}),
      },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - start;

    if (res.status === 204) {
      return { kind: 'closed', latencyMs, note: 'Date not open for booking yet (HTTP 204)' };
    }

    if (res.status === 400) {
      const body: any = await res.json().catch(() => null);
      if (body?.code === 32) {
        return { kind: 'closed', latencyMs, note: 'Content not listed yet' };
      }
      return { kind: 'error', latencyMs, error: `District HTTP 400: ${body?.msg || 'Bad Request'}` };
    }

    if (res.status !== 200) {
      return { kind: 'error', latencyMs, error: `District HTTP ${res.status}` };
    }

    const data: any = await res.json();
    const cinemas = [
      ...(data?.pageData?.nearbyCinemas ?? []),
      ...(data?.pageData?.farCinemas ?? []),
    ];

    const allSessions: NormalizedSession[] = [];
    const matchedSessions: NormalizedSession[] = [];

    for (const c of cinemas) {
      const cinemaName = c?.cinemaInfo?.name || `Cinema ${c?.id}`;
      for (const s of c?.sessions ?? []) {
        const timeStr = s.showTime ? toLocalTime(s.showTime) : s.showTimeText || 'Unknown';
        const fid = s.fid || s.mcd || '';
        const enc = s.encSessionId || '';
        const bookingLink = target.bookingUrl ||
          `https://www.district.in/movies/seat-layout/${fid}?encsessionid=${enc}&date=${date}&freeseating=false&fromsessions=true&type=CINEMAS`;

        const tiers = (s.areas || [])
          .map((a: any) => `${a.label} ₹${Math.round(a.price)} (${a.sAvail}/${a.sTotal})`)
          .join(' · ');

        const session: NormalizedSession = {
          sid: String(s.sid || `${c.id}-${s.showTime}`),
          cinema: cinemaName,
          time: timeStr,
          audi: s.audi || 'Main Screen',
          format: s.scrnFmt || '2D',
          avail: typeof s.avail === 'number' ? s.avail : null,
          total: typeof s.total === 'number' ? s.total : null,
          tiers,
          bookingUrl: bookingLink,
        };

        allSessions.push(session);

        // Filter checks
        let matchesCinema = true;
        if (target.cinemaFilter) {
          matchesCinema = cinemaName.toLowerCase().includes(target.cinemaFilter.toLowerCase());
        }

        let matchesFormat = true;
        if (target.formatFilter) {
          const fmt = (s.scrnFmt || '').toUpperCase();
          const targetFmt = target.formatFilter.toUpperCase();
          matchesFormat = fmt.includes(targetFmt);
        }

        if (matchesCinema && matchesFormat) {
          matchedSessions.push(session);
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
      error: `Network/API error: ${err.message}`,
    };
  }
}

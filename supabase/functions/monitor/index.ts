import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

interface WatchTarget {
  id: string;
  name: string;
  provider: "district" | "bookmyshow";
  movie_code: string;
  content_id?: string;
  ref_event_code?: string;
  city: string;
  region_code?: string;
  region_slug?: string;
  target_dates: string[];
  cinema_filter?: string;
  format_filter?: string;
  preferred_showtimes?: string[];
  language?: string;
  lat?: string;
  lng?: string;
  booking_url?: string;
  enabled: boolean;
  poll_interval_sec: number;
}

interface NormalizedSession {
  sid: string;
  cinema: string;
  time: string;
  audi?: string;
  format: string;
  avail: number | null;
  total: number | null;
  tiers?: string;
  bookingUrl: string;
}

interface CheckResult {
  kind: "open" | "closed" | "error";
  latencyMs: number;
  sessions?: NormalizedSession[];
  matchedSessions?: NormalizedSession[];
  note?: string;
  error?: string;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function generateGuestToken(): string {
  let digits = "";
  for (let i = 0; i < 18; i++) digits += Math.floor(Math.random() * 10);
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 11; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${Date.now()}_${digits}_${suffix}`;
}

function toLocalTime(utcDateStr: string): string {
  try {
    const d = new Date(utcDateStr.endsWith("Z") ? utcDateStr : `${utcDateStr}Z`);
    return d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return utcDateStr;
  }
}

// 1. DISTRICT PROVIDER
async function checkDistrict(target: WatchTarget, date: string): Promise<CheckResult> {
  const start = Date.now();
  const contentId = target.content_id || target.movie_code;
  const q = new URLSearchParams({
    version: "3",
    site_id: "1",
    channel: "mweb",
    child_site_id: "1",
    platform: "district",
    movieCode: target.movie_code,
    city_key: target.city.toLowerCase(),
    content_id: contentId,
    date,
    latitude: target.lat || "13.0827",
    longitude: target.lng || "80.2707",
    cinemaOrderLogic: "3",
  });
  const url = `https://www.district.in/gw/consumer/movies/v5/movie?${q}`;

  try {
    const res = await fetch(url, {
      headers: {
        accept: "*/*",
        api_source: "district",
        "x-app-type": "ed_mweb",
        "x-guest-token": generateGuestToken(),
        "x-request-id": crypto.randomUUID(),
        "user-agent": UA,
        ...(target.booking_url ? { referer: target.booking_url } : {}),
      },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - start;

    if (res.status === 204) {
      return { kind: "closed", latencyMs, note: "Date not open for booking yet (HTTP 204)" };
    }

    if (res.status === 400) {
      const body: any = await res.json().catch(() => null);
      if (body?.code === 32) {
        return { kind: "closed", latencyMs, note: "Content not listed yet" };
      }
      return { kind: "error", latencyMs, error: `District HTTP 400: ${body?.msg || "Bad Request"}` };
    }

    if (res.status !== 200) {
      return { kind: "error", latencyMs, error: `District HTTP ${res.status}` };
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
        const timeStr = s.showTime ? toLocalTime(s.showTime) : s.showTimeText || "Unknown";
        const fid = s.mcd || s.mid || target.movie_code;
        const bookingLink = target.booking_url ||
          `https://www.district.in/movies/seat-layout/${fid}?sid=${s.sid}&cid=${s.cid}&date=${date}&freeseating=false&type=CINEMAS`;

        const tiers = (s.areas || [])
          .map((a: any) => `${a.label} ₹${Math.round(a.price)} (${a.sAvail}/${a.sTotal})`)
          .join(" · ");

        const session: NormalizedSession = {
          sid: String(s.sid || `${c.id}-${s.showTime}`),
          cinema: cinemaName,
          time: timeStr,
          audi: s.audi || "Main Screen",
          format: s.scrnFmt || "2D",
          avail: typeof s.avail === "number" ? s.avail : null,
          total: typeof s.total === "number" ? s.total : null,
          tiers,
          bookingUrl: bookingLink,
        };

        allSessions.push(session);

        let matchesCinema = true;
        if (target.cinema_filter) {
          matchesCinema = cinemaName.toLowerCase().includes(target.cinema_filter.toLowerCase());
        }

        let matchesFormat = true;
        if (target.format_filter) {
          const fmt = (s.scrnFmt || "").toUpperCase();
          matchesFormat = fmt.includes(target.format_filter.toUpperCase());
        }

        if (matchesCinema && matchesFormat) {
          matchedSessions.push(session);
        }
      }
    }

    return {
      kind: "open",
      latencyMs,
      sessions: allSessions,
      matchedSessions,
    };
  } catch (err: any) {
    return {
      kind: "error",
      latencyMs: Date.now() - start,
      error: `Network/API error: ${err.message}`,
    };
  }
}

// 2. BOOKMYSHOW PROVIDER
function collectVenueCards(node: any, out: any[] = []): any[] {
  if (Array.isArray(node)) {
    for (const n of node) collectVenueCards(n, out);
  } else if (node && typeof node === "object") {
    if (node.type === "venue-card") out.push(node);
    for (const v of Object.values(node)) collectVenueCards(v, out);
  }
  return out;
}

function extractBmsTiers(showtime: any): string {
  const widgets = showtime?.customGestureCTA?.additionalData?.bottomSheetData?.widgets ?? [];
  return widgets
    .filter((w: any) => w?.variableData?.seatType)
    .map((w: any) => {
      const v = w.variableData;
      const cost = String(v.seatCost || "").replace(/[^\d.]/g, "");
      const price = cost ? `₹${Math.round(Number(cost))}` : "";
      return `${v.seatType} ${price} (${v.seatAvalibility || ""})`.replace(/\s+/g, " ").trim();
    })
    .join(" · ");
}

async function checkBookMyShow(target: WatchTarget, date: string): Promise<CheckResult> {
  const start = Date.now();
  const dateCode = date.replaceAll("-", "");
  const eventCode = target.movie_code;
  const q = new URLSearchParams({
    etCodes: eventCode,
    dateCode,
    isDesktop: "true",
    regionCode: target.region_code || "CHEN",
    xLocationShared: "false",
    memberId: "",
    lsId: "",
    subCode: "",
    appCode: "WEB",
    refEventCode: target.ref_event_code || eventCode,
    ...(target.language ? { language: target.language } : {}),
  });
  const url = `https://in.bookmyshow.com/api/movies-data/v5/showtimes-by-event/primary-dynamic?${q}`;

  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json, text/plain, */*",
        "user-agent": UA,
        "x-region-code": target.region_code || "CHEN",
        "x-region-slug": target.region_slug || "chennai",
        "x-latitude": target.lat || "13.0827",
        "x-longitude": target.lng || "80.2707",
        "x-bms-id": `1.${Math.floor(Math.random() * 9e8 + 1e8)}.${Date.now()}`,
        "x-app-code": "WEB",
        "x-platform-code": "WEB",
        "x-platform": "WEB",
      },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - start;

    if (res.status === 403) {
      return { kind: "error", latencyMs, error: "BookMyShow Cloudflare Challenge (HTTP 403)" };
    }
    if (res.status !== 200) {
      return { kind: "error", latencyMs, error: `BookMyShow HTTP ${res.status}` };
    }

    const data: any = await res.json();
    const venueCards = collectVenueCards(data);

    if (venueCards.length === 0) {
      return { kind: "closed", latencyMs, note: "No venues or showtimes listed for this date" };
    }

    const allSessions: NormalizedSession[] = [];
    const matchedSessions: NormalizedSession[] = [];

    for (const card of venueCards) {
      const cinemaName = card?.venueName || "Unknown Cinema";
      const venueCode = card?.venueCode || "";
      const showtimes = card?.showtimes || [];

      for (const st of showtimes) {
        const timeStr = st.showTimeDisplay || st.showTime || "Unknown";
        const formatStr = st.screenFormat || st.format || card.format || "2D";
        const sid = String(st.sessionId || `${venueCode}-${st.showTime}`);
        const bookingLink = target.booking_url ||
          (st.sessionToken
            ? `https://in.bookmyshow.com/booktickets/${venueCode}/${st.sessionToken}`
            : `https://in.bookmyshow.com/buytickets/${target.region_slug || "chennai"}`);

        const session: NormalizedSession = {
          sid,
          cinema: cinemaName,
          time: timeStr,
          audi: st.audiName || st.screenName || "Screen",
          format: formatStr,
          avail: st.totalSeatsAvailable ?? null,
          total: st.totalSeats ?? null,
          tiers: extractBmsTiers(st),
          bookingUrl: bookingLink,
        };

        allSessions.push(session);

        let matchesCinema = true;
        if (target.cinema_filter) {
          matchesCinema = cinemaName.toLowerCase().includes(target.cinema_filter.toLowerCase());
        }

        let matchesFormat = true;
        if (target.format_filter) {
          matchesFormat = formatStr.toUpperCase().includes(target.format_filter.toUpperCase());
        }

        if (matchesCinema && matchesFormat) {
          matchedSessions.push(session);
        }
      }
    }

    return {
      kind: matchedSessions.length > 0 ? "open" : "closed",
      latencyMs,
      sessions: allSessions,
      matchedSessions,
      note: matchedSessions.length === 0 ? "Showtimes found, but none matched filter" : undefined,
    };
  } catch (err: any) {
    return {
      kind: "error",
      latencyMs: Date.now() - start,
      error: `Network/API error: ${err.message}`,
    };
  }
}

// 3. TELEGRAM ALERT DISPATCHER
async function sendTelegramAlert(
  botToken: string,
  chatId: string,
  target: WatchTarget,
  session: NormalizedSession,
  date: string
): Promise<boolean> {
  if (!botToken || !chatId || botToken === "demo_token" || chatId === "demo_chat") {
    console.log(`[Telegram Alert Skipped] Bot token or chat ID not set. Found: ${session.cinema} - ${session.time}`);
    return false;
  }

  const isImax = (session.format || "").toUpperCase().includes("IMAX");
  const icon = isImax ? "🌟🚨" : "🎟️⚡";
  const providerName = target.provider === "district" ? "District" : "BookMyShow";

  let seatDetails = "";
  if (session.avail !== null && session.total !== null) {
    seatDetails = `\n💺 *Available:* ${session.avail} / ${session.total} seats`;
  } else if (session.avail !== null) {
    seatDetails = `\n💺 *Available:* ${session.avail} seats`;
  }

  const tiersText = session.tiers ? `\n💰 *Pricing:* ${session.tiers}` : "";

  const text = `${icon} *TICKETS OPEN!*
━━━━━━━━━━━━━━━━━━
🎬 *${target.name}*
🏢 *Cinema:* ${session.cinema}
📅 *Date:* ${date}
⏰ *Time:* ${session.time} (${session.format})${seatDetails}${tiersText}
🌐 *Source:* ${providerName}
━━━━━━━━━━━━━━━━━━
👉 [BOOK TICKETS IMMEDIATELY](${session.bookingUrl})`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
    });
    const json: any = await res.json();
    return json.ok === true;
  } catch (err) {
    console.error("[Telegram Error]", err);
    return false;
  }
}

// 4. MAIN MONITOR RUNNER
Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID") || "";

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch all enabled watches
  const { data: watches, error: watchErr } = await supabase
    .from("watches")
    .select("*")
    .eq("enabled", true);

  if (watchErr) {
    return new Response(JSON.stringify({ error: watchErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  const providerStats: Record<string, { latency: number; status: string; error?: string; matches: number }> = {
    district: { latency: 0, status: "online", matches: 0 },
    bookmyshow: { latency: 0, status: "online", matches: 0 },
  };

  for (const watch of (watches as WatchTarget[]) || []) {
    const dates = Array.isArray(watch.target_dates) ? watch.target_dates : [];

    for (const date of dates) {
      let res: CheckResult;
      if (watch.provider === "district") {
        res = await checkDistrict(watch, date);
      } else {
        res = await checkBookMyShow(watch, date);
      }

      providerStats[watch.provider].latency = res.latencyMs;

      if (res.kind === "error") {
        providerStats[watch.provider].status = "error";
        providerStats[watch.provider].error = res.error;
      }

      if (res.kind === "open" && res.matchedSessions && res.matchedSessions.length > 0) {
        providerStats[watch.provider].matches += res.matchedSessions.length;

        for (const session of res.matchedSessions) {
          // Check if session was already alerted in Supabase
          const { data: existing } = await supabase
            .from("alerted_sessions")
            .select("id")
            .eq("watch_id", watch.id)
            .eq("session_id", session.sid)
            .maybeSingle();

          if (!existing) {
            // New unalerted session! Save to Supabase and send Telegram
            await supabase.from("alerted_sessions").insert({
              watch_id: watch.id,
              session_id: session.sid,
              cinema: session.cinema,
              time: session.time,
              format: session.format,
              avail: session.avail,
              total: session.total,
            });

            // Log event
            await supabase.from("event_logs").insert({
              watch_id: watch.id,
              provider: watch.provider,
              event_type: "tickets_detected",
              message: `Available tickets detected: ${session.cinema} at ${session.time} (${session.format})`,
              metadata: session,
            });

            // Dispatch Telegram alert
            const sent = await sendTelegramAlert(telegramBotToken, telegramChatId, watch, session, date);
            results.push({
              watch: watch.name,
              session: session.cinema,
              time: session.time,
              alertDispatched: sent,
            });
          }
        }
      }
    }
  }

  // Update provider health
  for (const [provider, stats] of Object.entries(providerStats)) {
    await supabase.from("provider_health").upsert({
      provider,
      status: stats.status,
      latency_ms: stats.latency,
      last_error: stats.error || null,
      last_check_at: new Date().toISOString(),
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      providerStats,
      dispatchedAlerts: results,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});

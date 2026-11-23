-- Schema for MovieWatch

-- 1. Watches table
CREATE TABLE IF NOT EXISTS public.watches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  movie_code TEXT NOT NULL,
  content_id TEXT,
  ref_event_code TEXT,
  city TEXT NOT NULL,
  region_code TEXT,
  region_slug TEXT,
  target_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
  cinema_filter TEXT,
  format_filter TEXT,
  preferred_showtimes JSONB DEFAULT '[]'::jsonb,
  language TEXT,
  lat TEXT DEFAULT '13.0827',
  lng TEXT DEFAULT '80.2707',
  booking_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  poll_interval_sec INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Alerted Sessions (Deduplication)
CREATE TABLE IF NOT EXISTS public.alerted_sessions (
  id BIGSERIAL PRIMARY KEY,
  watch_id TEXT NOT NULL REFERENCES public.watches(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  cinema TEXT,
  time TEXT,
  format TEXT,
  avail INTEGER,
  total INTEGER,
  alerted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(watch_id, session_id)
);

-- 3. Provider Health & Last Scan
CREATE TABLE IF NOT EXISTS public.provider_health (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  last_check_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  latency_ms INTEGER DEFAULT 0,
  last_error TEXT,
  check_count BIGINT DEFAULT 0,
  match_count BIGINT DEFAULT 0
);

-- 4. Event Logs (Audit / Scan history)
CREATE TABLE IF NOT EXISTS public.event_logs (
  id BIGSERIAL PRIMARY KEY,
  watch_id TEXT REFERENCES public.watches(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable RLS and create open policy for anon (read) and service_role (read/write)
ALTER TABLE public.watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerted_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on watches" ON public.watches FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update/delete on watches" ON public.watches FOR ALL USING (true);

CREATE POLICY "Allow public read on alerted_sessions" ON public.alerted_sessions FOR SELECT USING (true);
CREATE POLICY "Allow public insert on alerted_sessions" ON public.alerted_sessions FOR ALL USING (true);

CREATE POLICY "Allow public read on provider_health" ON public.provider_health FOR SELECT USING (true);
CREATE POLICY "Allow public upsert on provider_health" ON public.provider_health FOR ALL USING (true);

CREATE POLICY "Allow public read on event_logs" ON public.event_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on event_logs" ON public.event_logs FOR ALL USING (true);

-- Insert initial Chennai watch targets
INSERT INTO public.watches (
  id, name, provider, movie_code, content_id, ref_event_code, city, region_code, region_slug,
  target_dates, cinema_filter, format_filter, preferred_showtimes, lat, lng, enabled, poll_interval_sec
) VALUES 
(
  'watch-dune-palazzo',
  'Dune: Part Three — PVR Palazzo IMAX',
  'bookmyshow',
  'ET00526290',
  NULL,
  'ET00526290',
  'chennai',
  'CHEN',
  'chennai',
  '["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-18"]'::jsonb,
  'Palazzo',
  'IMAX',
  '[]'::jsonb,
  '13.0827',
  '80.2707',
  true,
  60
),
(
  'watch-avengers-chennai-imax',
  'Avengers: Doomsday — Chennai IMAX',
  'district',
  '176735',
  '176735',
  NULL,
  'chennai',
  NULL,
  NULL,
  '["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01"]'::jsonb,
  'Palazzo',
  'IMAX',
  '[]'::jsonb,
  '13.0827',
  '80.2707',
  true,
  60
),
(
  'watch-om-sangam',
  'O.M: Operation Mole — Sangam Cinemas',
  'district',
  '225928',
  '225928',
  NULL,
  'chennai',
  NULL,
  NULL,
  '["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]'::jsonb,
  'Sangam',
  NULL,
  '[]'::jsonb,
  '13.0827',
  '80.2707',
  true,
  60
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  target_dates = EXCLUDED.target_dates,
  updated_at = timezone('utc'::text, now());

-- Initial provider health rows
INSERT INTO public.provider_health (provider, status, latency_ms)
VALUES 
  ('district', 'online', 69),
  ('bookmyshow', 'online', 48)
ON CONFLICT (provider) DO NOTHING;

# MovieWatch — Ultra-Fast Movie Ticket Intelligence & Monitor

A cloud-hosted, 24/7 personal movie ticket availability monitor designed for **maximum detection speed**, targeting **BookMyShow** and **District** in Chennai (specifically IMAX at PVR Palazzo and major tentpoles like *Dune: Part Three* and *Avengers: Doomsday*).

Built without Next.js or serverless crons: runs as a persistent, asynchronous Node.js worker with direct REST/JSON APIs and a minimal dark dashboard.

---

## 1. Speed Optimization & Direct API Architecture

Unlike scrapers that spin up heavy headless browsers or repeatedly download megabytes of server-rendered HTML, MovieWatch communicates directly with the lightweight backend APIs that mobile and web clients use:

### District Direct API (`district.in`)
- **Endpoint**: `GET https://www.district.in/gw/consumer/movies/v5/movie?version=3&site_id=1&channel=mweb&child_site_id=1&platform=district&movieCode=<id>&city_key=<city>&content_id=<id>&date=YYYY-MM-DD&latitude=13.0827&longitude=80.2707&cinemaOrderLogic=3`
- **Authentication**: Client-side generated `x-guest-token` (`<epoch_ms>_<18 digits>_<11 chars>`). No login, no session cookies.
- **Signal**:
  - `HTTP 204 No Content` = Date not open for booking yet (100–300ms roundtrip).
  - `HTTP 200 OK` = Bookings are OPEN! Contains exact seat counts, pricing categories, and auditorium names.
- **Latency**: **~300ms**.

### BookMyShow Direct API (`in.bookmyshow.com`)
- **Endpoint**: `GET https://in.bookmyshow.com/api/movies-data/v5/showtimes-by-event/primary-dynamic?etCodes=<codeRef>&dateCode=YYYYMMDD&regionCode=CHEN&isDesktop=true&xLocationShared=false&appCode=WEB`
- **Cloudflare Bypass**: BookMyShow protects its API using TLS fingerprint inspection (which returns 403 on Node `fetch` and `curl`). MovieWatch uses [`impit`](https://github.com/apify/impit) to negotiate TLS with a genuine Chrome browser fingerprint.
- **Signal**:
  - `HTTP 200` without `showtimeWidgets` = Closed / Not on sale yet.
  - `HTTP 200` with `showtimeWidgets` = Opened! Walks venue card widgets to extract IMAX sessions and bottom-sheet price tiers.
- **Latency**: **~200ms**.

---

## 2. Configured Target Watches

Pre-configured in `server/src/store.ts` for immediate tracking:
1. **Dune: Part Three — PVR Palazzo IMAX, Chennai** (BookMyShow `ET00526290`)
2. **Avengers: Doomsday — Chennai IMAX** (District `176735`)
3. **O.M: Operation Mole — Sangam Cinemas, Chennai** (District `225928`)

Unlimited additional movies, dates, formats, and cinemas can be added via the Dashboard or directly through Telegram bot commands.

---

## 3. Telegram Bot Integration & Commands

### Instant Push Notifications
When a matching show opens, Telegram receives an immediate high-priority markdown alert:
```text
🌟🚨 TICKETS OPEN: DUNE: PART THREE — PVR PALAZZO IMAX 🌟🚨

🎬 Movie: Dune: Part Three
🏛️ Cinema: PVR Palazzo, Chennai
📺 Screen: IMAX with Laser
🎞️ Format: IMAX 2D
📅 Date: 2026-11-23
⏰ Showtime: 03:15 PM
💰 Prices: ROYAL ₹550 · CLUB ₹450

🌐 Platform: BookMyShow
🔗 [BOOK TICKETS IMMEDIATELY](https://in.bookmyshow.com/buytickets/...)
```

### Interactive Bot Commands
The bot listens for direct commands in your Telegram chat:
- `/list` — List all active targets and their current statuses
- `/check` — Trigger an immediate live scan across all targets
- `/pause <id>` — Pause monitoring for a target
- `/resume <id>` — Resume monitoring
- `/status` — View real-time provider latency and worker heartbeat

---

## 4. How to Run Locally

### Step 1: Install Dependencies & Build
```bash
# In server directory:
cd server
npm install
npm run build

# In client directory:
cd ../client
npm install
npm run build
```

### Step 2: Configure Environment (.env)
Create `server/.env`:
```ini
PORT=4000
NODE_ENV=production
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id
# Optional residential proxy if cloud IP gets challenged:
# PROXY_URL=socks5h://user:password@host:port
```

### Step 3: Start the Application
```bash
cd server
npm start
```
Open **[http://localhost:4000](http://localhost:4000)** in your browser. The single process serves the 24/7 worker, the Telegram listener, the REST API, and the compiled React dashboard!

---

## 5. Cloud Deployment (24/7 Without Your PC)

### Deploy to Railway (Recommended)
1. Push repository to your GitHub.
2. In Railway ([railway.app](https://railway.app)), click **New Project** → **Deploy from GitHub repo**.
3. Railway automatically detects the included `Dockerfile` and builds both frontend and backend.
4. In Railway **Variables**, add:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `PORT=4000`
5. Railway generates a public URL (e.g. `https://moviewatch.up.railway.app`).
6. The monitor runs continuously 24/7 in the cloud without requiring your computer to stay on.

---

## 6. Verification Test Suite
Run the provider integration test:
```bash
cd server
npm test
```
Outputs live sub-second verification across District and BookMyShow with genuine Chennai targets.

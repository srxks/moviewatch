import { WatchTarget, NormalizedSession } from './types.js';
import { store } from './store.js';

export class TelegramBot {
  private token: string;
  private defaultChatId: string;
  private offset = 0;
  private isPolling = false;

  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN || '';
    this.defaultChatId = process.env.TELEGRAM_CHAT_ID || '';
  }

  isConfigured(): boolean {
    return Boolean(this.token && !this.token.includes('your_token'));
  }

  async sendRawMessage(chatId: string, text: string): Promise<boolean> {
    if (!this.isConfigured() || !chatId) {
      console.log(`[Telegram] Bot not configured. Simulated message to ${chatId}:\n${text}\n`);
      return false;
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: false,
        }),
      });

      const json: any = await res.json();
      return json.ok === true;
    } catch (err: any) {
      console.error(`[Telegram] Send failed:`, err.message);
      return false;
    }
  }

  async sendShowAlert(target: WatchTarget, session: NormalizedSession, date: string): Promise<boolean> {
    const isImax = (session.format || '').toUpperCase().includes('IMAX');
    const icon = isImax ? '🌟🚨' : '🎟️⚡';
    const providerName = target.provider === 'district' ? 'District' : 'BookMyShow';

    let seatDetails = '';
    if (session.avail !== null && session.total !== null) {
      seatDetails = `\n💺 *Seats*: ${session.avail} available / ${session.total} total`;
    }

    let tierDetails = '';
    if (session.tiers) {
      tierDetails = `\n💰 *Prices*: ${session.tiers}`;
    }

    const message =
      `${icon} *TICKETS OPEN: ${target.name.toUpperCase()}* ${icon}\n\n` +
      `🎬 *Movie*: ${target.name}\n` +
      `🏛️ *Cinema*: ${session.cinema}\n` +
      (session.audi ? `📺 *Screen*: ${session.audi}\n` : '') +
      `🎞️ *Format*: ${session.format || 'Standard'}\n` +
      `📅 *Date*: ${date}\n` +
      `⏰ *Showtime*: ${session.time}` +
      seatDetails +
      tierDetails +
      `\n\n🌐 *Platform*: ${providerName}\n` +
      `🔗 [BOOK TICKETS IMMEDIATELY](${session.bookingUrl || target.bookingUrl || 'https://in.bookmyshow.com'})`;

    const targetChat = this.defaultChatId;
    const sent = await this.sendRawMessage(targetChat, message);

    if (sent) {
      store.addEventLog({
        watchId: target.id,
        watchName: target.name,
        provider: target.provider,
        type: 'NEW_SHOW',
        message: `Alert sent: ${session.cinema} - ${session.time} (${session.format})`,
        details: session
      });
    }

    return sent;
  }

  async sendWarning(provider: string, message: string): Promise<boolean> {
    const text = `⚠️ *[ALERT] MOVIEWATCH PROVIDER WARNING*\n\n` +
      `Provider: *${provider.toUpperCase()}*\n` +
      `Status: *DEGRADED / BLOCKED*\n` +
      `Details: ${message}\n\n` +
      `Timestamp: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

    return this.sendRawMessage(this.defaultChatId, text);
  }

  async sendTestAlert(chatId?: string): Promise<boolean> {
    const targetChat = chatId || this.defaultChatId;
    const text = `🧪 *MovieWatch Telegram Alert Test*\n\n` +
      `Your personal 24/7 ticket monitor is successfully connected!\n` +
      `You will receive immediate priority alerts for IMAX and opened showtimes.\n\n` +
      `Commands:\n` +
      `• /list — View all active watches\n` +
      `• /check — Trigger instant scan\n` +
      `• /pause <id> — Pause watch\n` +
      `• /resume <id> — Resume watch\n\n` +
      `Timestamp: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

    return this.sendRawMessage(targetChat, text);
  }

  // Interactive Bot Command Polling
  startCommandListener(onManualCheck: () => Promise<void>) {
    if (!this.isConfigured() || this.isPolling) return;
    this.isPolling = true;

    const poll = async () => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.offset}&timeout=20`, {
          signal: AbortSignal.timeout(25000),
        });
        const data: any = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const u of data.result) {
            this.offset = u.update_id + 1;
            const msg = u.message;
            if (!msg || !msg.text) continue;

            const text = msg.text.trim();
            const chatId = String(msg.chat.id);

            if (text === '/start' || text === '/help') {
              await this.sendRawMessage(chatId,
                `🎟️ *MovieWatch Control Bot*\n\n` +
                `Available commands:\n` +
                `• /list - List active movie watches\n` +
                `• /check - Poll all targets now\n` +
                `• /pause <id> - Pause a watch\n` +
                `• /resume <id> - Resume a watch\n` +
                `• /status - View provider health and latency`
              );
            } else if (text === '/list') {
              const watches = store.getWatches();
              const list = watches.map(w =>
                `• *${w.name}* [${w.provider}]\n  ID: \`${w.id}\` | Status: ${w.enabled ? (w.lastStatus || 'polling') : 'PAUSED'}`
              ).join('\n\n');
              await this.sendRawMessage(chatId, `📋 *Active Movie Watches (${watches.length}):*\n\n${list || 'No watches configured.'}`);
            } else if (text === '/check') {
              await this.sendRawMessage(chatId, `⚡ Running immediate scan across all targets...`);
              await onManualCheck();
              await this.sendRawMessage(chatId, `✅ Scan complete.`);
            } else if (text.startsWith('/pause ')) {
              const id = text.replace('/pause ', '').trim();
              const w = store.getWatchById(id);
              if (w) {
                w.enabled = false;
                store.saveWatch(w);
                await this.sendRawMessage(chatId, `⏸️ Paused watch: *${w.name}*`);
              } else {
                await this.sendRawMessage(chatId, `❌ Watch with ID \`${id}\` not found.`);
              }
            } else if (text.startsWith('/resume ')) {
              const id = text.replace('/resume ', '').trim();
              const w = store.getWatchById(id);
              if (w) {
                w.enabled = true;
                store.saveWatch(w);
                await this.sendRawMessage(chatId, `▶️ Resumed watch: *${w.name}*`);
              } else {
                await this.sendRawMessage(chatId, `❌ Watch with ID \`${id}\` not found.`);
              }
            } else if (text === '/status') {
              const health = store.getProvidersHealth();
              const d = health.district;
              const b = health.bookmyshow;
              await this.sendRawMessage(chatId,
                `🩺 *System Status:*\n\n` +
                `• *District*: ${d?.status.toUpperCase()} (${d?.latencyMs}ms)\n` +
                `• *BookMyShow*: ${b?.status.toUpperCase()} (${b?.latencyMs}ms)\n` +
                `• Worker Heartbeat: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`
              );
            }
          }
        }
      } catch {
        // Sleep and retry
      }

      if (this.isPolling) {
        setTimeout(poll, 2000);
      }
    };

    poll();
  }

  stopCommandListener() {
    this.isPolling = false;
  }
}

export const telegram = new TelegramBot();

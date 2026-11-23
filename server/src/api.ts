import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { store } from './store.js';
import { monitor } from './monitor.js';
import { telegram } from './telegram.js';
import { WatchTarget } from './types.js';

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health Check for Cloud Platforms (Railway, Render, Fly)
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', worker: 'online', uptime: Math.floor(process.uptime()) });
  });

  // Status & Telemetry
  app.get('/api/status', (req, res) => {
    const watches = store.getWatches();
    const providers = store.getProvidersHealth();
    const recentLogs = store.getEventLogs(5);

    res.json({
      worker: {
        status: 'online',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      providers,
      watches: {
        total: watches.length,
        active: watches.filter(w => w.enabled).length,
      },
      recentEvents: recentLogs,
    });
  });

  // Watches
  app.get('/api/watches', (req, res) => {
    res.json({ watches: store.getWatches() });
  });

  app.post('/api/watches', (req, res) => {
    const body = req.body;
    if (!body.name || !body.provider || !body.movieCode) {
      return res.status(400).json({ error: 'name, provider, and movieCode are required' });
    }

    const id = body.id || `watch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const watch: WatchTarget = {
      id,
      name: body.name,
      provider: body.provider,
      movieCode: body.movieCode,
      contentId: body.contentId || body.movieCode,
      refEventCode: body.refEventCode || body.movieCode,
      city: body.city || 'chennai',
      regionCode: body.regionCode || (body.city?.toLowerCase() === 'chennai' ? 'CHEN' : undefined),
      regionSlug: body.regionSlug || body.city?.toLowerCase() || 'chennai',
      lat: body.lat || '13.0827',
      lng: body.lng || '80.2707',
      targetDates: Array.isArray(body.targetDates) && body.targetDates.length > 0 ? body.targetDates : [new Date().toISOString().split('T')[0]],
      cinemaFilter: body.cinemaFilter,
      formatFilter: body.formatFilter,
      language: body.language,
      bookingUrl: body.bookingUrl,
      enabled: body.enabled !== undefined ? body.enabled : true,
      pollIntervalSec: body.pollIntervalSec || 60,
      createdAt: body.createdAt || new Date().toISOString(),
    };

    store.saveWatch(watch);
    // Trigger immediate check for new watch
    monitor.pollWatch(watch).catch(console.error);

    res.json({ success: true, watch });
  });

  app.delete('/api/watches/:id', (req, res) => {
    const deleted = store.deleteWatch(req.params.id);
    res.json({ success: deleted });
  });

  app.post('/api/watches/:id/toggle', (req, res) => {
    const w = store.getWatchById(req.params.id);
    if (!w) return res.status(404).json({ error: 'Watch not found' });
    w.enabled = !w.enabled;
    store.saveWatch(w);
    res.json({ success: true, enabled: w.enabled });
  });

  // Manual Trigger
  app.post('/api/check-now', async (req, res) => {
    const watchId = req.body.watchId;
    if (watchId) {
      const w = store.getWatchById(watchId);
      if (w) await monitor.pollWatch(w);
    } else {
      await monitor.pollAll();
    }
    res.json({ success: true, message: 'Check completed' });
  });

  // Recent Event Logs
  app.get('/api/events', (req, res) => {
    const limit = Number(req.query.limit) || 50;
    res.json({ events: store.getEventLogs(limit) });
  });

  // Telegram test
  app.post('/api/test-telegram', async (req, res) => {
    const chatId = req.body.chatId;
    const ok = await telegram.sendTestAlert(chatId);
    res.json({ success: ok });
  });

  // Serve static client assets if built
  const clientDist = path.resolve(process.cwd(), '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return app;
}

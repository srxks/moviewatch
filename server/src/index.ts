import dotenv from 'dotenv';
dotenv.config();

import { createServer } from './api.js';
import { monitor } from './monitor.js';

const PORT = Number(process.env.PORT || 4000);

async function main() {
  console.log('===========================================================');
  console.log('   MovieWatch — Ultra-Fast 24/7 Movie Ticket Monitor       ');
  console.log('   District & BookMyShow Direct Real-Time Intelligence     ');
  console.log('===========================================================');

  const app = createServer();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] REST API & Dashboard listening on http://0.0.0.0:${PORT}`);
  });

  // Start background monitoring worker
  await monitor.start();

  const shutdown = () => {
    console.log('\n[Shutdown] Stopping monitor and HTTP server...');
    monitor.stop();
    server.close(() => {
      console.log('[Shutdown] Server stopped.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
